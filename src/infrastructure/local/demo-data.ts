import type {
  AuditEvent, BusinessSettings, Category, Customer, LedgerSnapshot, Payment, Product,
  Purchase, PurchaseItem, Sale, SaleItem, StockMovement, Supplier,
} from '../../domain/models';
import { LedgerDatabase } from './database';

const now = new Date();
const atDay = (daysAgo: number, hour = 10, minute = 15) => {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

const demoProducts: Product[] = [
  { id: 'prod-paper', name: 'A4 Copier Paper', sku: 'PAP-001', categoryId: 'cat-stationery', categoryName: 'Stationery', unit: 'ream', costMinor: 21000, priceMinor: 26000, quantity: 42, reorderPoint: 12, archived: false, createdAt: atDay(100), updatedAt: atDay(0) },
  { id: 'prod-pen', name: 'Blue Ball Pen (Box)', sku: 'PEN-014', categoryId: 'cat-stationery', categoryName: 'Stationery', unit: 'box', costMinor: 8500, priceMinor: 12000, quantity: 18, reorderPoint: 10, archived: false, createdAt: atDay(90), updatedAt: atDay(0) },
  { id: 'prod-tape', name: 'Packing Tape 2 in', sku: 'PKG-022', categoryId: 'cat-packaging', categoryName: 'Packaging', unit: 'roll', costMinor: 3200, priceMinor: 5000, quantity: 7, reorderPoint: 12, archived: false, createdAt: atDay(80), updatedAt: atDay(0) },
  { id: 'prod-roll', name: 'Thermal Receipt Roll', sku: 'POS-006', categoryId: 'cat-pos', categoryName: 'POS supplies', unit: 'pack', costMinor: 14500, priceMinor: 19000, quantity: 4, reorderPoint: 8, archived: false, createdAt: atDay(75), updatedAt: atDay(0) },
  { id: 'prod-envelope', name: 'Courier Envelope', sku: 'PKG-018', categoryId: 'cat-packaging', categoryName: 'Packaging', unit: 'pack', costMinor: 5500, priceMinor: 8000, quantity: 64, reorderPoint: 15, archived: false, createdAt: atDay(60), updatedAt: atDay(0) },
  { id: 'prod-marker', name: 'Marker Set', sku: 'STA-009', categoryId: 'cat-stationery', categoryName: 'Stationery', unit: 'set', costMinor: 9000, priceMinor: 14000, quantity: 0, reorderPoint: 6, archived: false, createdAt: atDay(50), updatedAt: atDay(0) },
];

const demoCategories: Category[] = [
  { id: 'cat-stationery', name: 'Stationery', createdAt: atDay(100) },
  { id: 'cat-packaging', name: 'Packaging', createdAt: atDay(90) },
  { id: 'cat-pos', name: 'POS supplies', createdAt: atDay(80) },
];

const demoCustomers: Customer[] = [
  { id: 'customer-aarav', name: 'Aarav Sharma', address: '', phone: '+91 98765 01234', email: '', notes: '', archived: false, createdAt: atDay(70), updatedAt: atDay(0) },
  { id: 'customer-meera', name: 'Meera Stores', address: '', phone: '+91 98111 22008', email: '', notes: 'Weekly stationery order', archived: false, createdAt: atDay(65), updatedAt: atDay(0) },
  { id: 'customer-kabir', name: 'Kabir Enterprises', address: '', phone: '+91 98990 33441', email: '', notes: '', archived: false, createdAt: atDay(48), updatedAt: atDay(0) },
  { id: 'customer-nisha', name: 'Nisha Verma', address: '', phone: '+91 98222 12345', email: '', notes: '', archived: false, createdAt: atDay(32), updatedAt: atDay(0) },
];

const demoSuppliers: Supplier[] = [
  { id: 'supplier-bhopal', name: 'Bhopal Paper House', phone: '+91 755 410 2211', email: '', notes: 'Net 7 days', archived: false, createdAt: atDay(120), updatedAt: atDay(0) },
  { id: 'supplier-central', name: 'Central Packaging Co.', phone: '+91 755 422 8130', email: '', notes: 'On delivery', archived: false, createdAt: atDay(100), updatedAt: atDay(0) },
  { id: 'supplier-office', name: 'OfficeMart Wholesale', phone: '+91 755 488 0912', email: '', notes: 'Net 15 days', archived: false, createdAt: atDay(88), updatedAt: atDay(0) },
];

const demoSales: Sale[] = [
  { id: 'sale-demo-1048', invoiceNo: 'INV-1048', operationKey: 'demo-sale-1048', customerId: 'customer-aarav', customerName: 'Aarav Sharma', createdAt: atDay(0, 10, 42), subtotalMinor: 78000, discountMinor: 0, taxMinor: 0, taxRateBps: 0, totalMinor: 78000 },
  { id: 'sale-demo-1047', invoiceNo: 'INV-1047', operationKey: 'demo-sale-1047', customerId: null, customerName: 'Walk-in customer', createdAt: atDay(0, 9, 18), subtotalMinor: 24000, discountMinor: 0, taxMinor: 0, taxRateBps: 0, totalMinor: 24000 },
  { id: 'sale-demo-1046', invoiceNo: 'INV-1046', operationKey: 'demo-sale-1046', customerId: 'customer-meera', customerName: 'Meera Stores', createdAt: atDay(1, 16, 20), subtotalMinor: 25000, discountMinor: 0, taxMinor: 0, taxRateBps: 0, totalMinor: 25000 },
  { id: 'sale-demo-1045', invoiceNo: 'INV-1045', operationKey: 'demo-sale-1045', customerId: 'customer-kabir', customerName: 'Kabir Enterprises', createdAt: atDay(3, 11, 35), subtotalMinor: 52000, discountMinor: 0, taxMinor: 0, taxRateBps: 0, totalMinor: 52000 },
  { id: 'sale-demo-1044', invoiceNo: 'INV-1044', operationKey: 'demo-sale-1044', customerId: 'customer-nisha', customerName: 'Nisha Verma', createdAt: atDay(6, 14, 8), subtotalMinor: 38000, discountMinor: 0, taxMinor: 0, taxRateBps: 0, totalMinor: 38000 },
];

const demoSaleItems: SaleItem[] = [
  { id: 'item-1048-paper', saleId: 'sale-demo-1048', productId: 'prod-paper', productName: 'A4 Copier Paper', sku: 'PAP-001', quantity: 3, unitPriceMinor: 26000, unitCostMinor: 21000, lineSubtotalMinor: 78000, discountMinor: 0, taxMinor: 0, lineTotalMinor: 78000 },
  { id: 'item-1047-pen', saleId: 'sale-demo-1047', productId: 'prod-pen', productName: 'Blue Ball Pen (Box)', sku: 'PEN-014', quantity: 2, unitPriceMinor: 12000, unitCostMinor: 8500, lineSubtotalMinor: 24000, discountMinor: 0, taxMinor: 0, lineTotalMinor: 24000 },
  { id: 'item-1046-tape', saleId: 'sale-demo-1046', productId: 'prod-tape', productName: 'Packing Tape 2 in', sku: 'PKG-022', quantity: 5, unitPriceMinor: 5000, unitCostMinor: 3200, lineSubtotalMinor: 25000, discountMinor: 0, taxMinor: 0, lineTotalMinor: 25000 },
  { id: 'item-1045-paper', saleId: 'sale-demo-1045', productId: 'prod-paper', productName: 'A4 Copier Paper', sku: 'PAP-001', quantity: 2, unitPriceMinor: 26000, unitCostMinor: 21000, lineSubtotalMinor: 52000, discountMinor: 0, taxMinor: 0, lineTotalMinor: 52000 },
  { id: 'item-1044-roll', saleId: 'sale-demo-1044', productId: 'prod-roll', productName: 'Thermal Receipt Roll', sku: 'POS-006', quantity: 2, unitPriceMinor: 19000, unitCostMinor: 14500, lineSubtotalMinor: 38000, discountMinor: 0, taxMinor: 0, lineTotalMinor: 38000 },
];

const demoPurchases: Purchase[] = [
  { id: 'purchase-demo-201', reference: 'PUR-0201', supplierId: 'supplier-bhopal', supplierName: 'Bhopal Paper House', status: 'received', createdAt: atDay(4), receivedAt: atDay(4), subtotalMinor: 210000, notes: 'Monthly paper stock' },
  { id: 'purchase-demo-202', reference: 'PUR-0202', supplierId: 'supplier-central', supplierName: 'Central Packaging Co.', status: 'received', createdAt: atDay(2), receivedAt: atDay(2), subtotalMinor: 64000, notes: 'Tape replenishment' },
  { id: 'purchase-demo-203', reference: 'PUR-0203', supplierId: 'supplier-office', supplierName: 'OfficeMart Wholesale', status: 'draft', createdAt: atDay(0, 8, 30), receivedAt: null, subtotalMinor: 43500, notes: 'Awaiting delivery' },
];

const demoPurchaseItems: PurchaseItem[] = [
  { id: 'purchase-item-201', purchaseId: 'purchase-demo-201', productId: 'prod-paper', productName: 'A4 Copier Paper', sku: 'PAP-001', quantity: 10, unitCostMinor: 21000, lineTotalMinor: 210000 },
  { id: 'purchase-item-202', purchaseId: 'purchase-demo-202', productId: 'prod-tape', productName: 'Packing Tape 2 in', sku: 'PKG-022', quantity: 20, unitCostMinor: 3200, lineTotalMinor: 64000 },
  { id: 'purchase-item-203', purchaseId: 'purchase-demo-203', productId: 'prod-roll', productName: 'Thermal Receipt Roll', sku: 'POS-006', quantity: 3, unitCostMinor: 14500, lineTotalMinor: 43500 },
];

const demoPayments: Payment[] = [
  { id: 'payment-1048', direction: 'in', partyType: 'customer', partyId: 'customer-aarav', saleId: 'sale-demo-1048', purchaseId: null, amountMinor: 78000, method: 'upi', operationKey: 'demo-payment-1048', createdAt: atDay(0, 10, 42), note: 'Paid at checkout' },
  { id: 'payment-1047', direction: 'in', partyType: 'customer', partyId: 'walk-in', saleId: 'sale-demo-1047', purchaseId: null, amountMinor: 24000, method: 'cash', operationKey: 'demo-payment-1047', createdAt: atDay(0, 9, 18), note: 'Paid at checkout' },
  { id: 'payment-1046', direction: 'in', partyType: 'customer', partyId: 'customer-meera', saleId: 'sale-demo-1046', purchaseId: null, amountMinor: 10000, method: 'upi', operationKey: 'demo-payment-1046', createdAt: atDay(1, 16, 20), note: 'Part payment' },
  { id: 'payment-1044', direction: 'in', partyType: 'customer', partyId: 'customer-nisha', saleId: 'sale-demo-1044', purchaseId: null, amountMinor: 38000, method: 'card', operationKey: 'demo-payment-1044', createdAt: atDay(6, 14, 8), note: 'Paid at checkout' },
  { id: 'payment-201', direction: 'out', partyType: 'supplier', partyId: 'supplier-bhopal', saleId: null, purchaseId: 'purchase-demo-201', amountMinor: 150000, method: 'bank', operationKey: 'demo-payment-201', createdAt: atDay(4), note: 'Part payment' },
  { id: 'payment-202', direction: 'out', partyType: 'supplier', partyId: 'supplier-central', saleId: null, purchaseId: 'purchase-demo-202', amountMinor: 64000, method: 'upi', operationKey: 'demo-payment-202', createdAt: atDay(2), note: 'Paid on delivery' },
];

const demoStockMovements: StockMovement[] = [
  { id: 'move-opening-paper', productId: 'prod-paper', productName: 'A4 Copier Paper', quantityDelta: 37, reason: 'Opening stock', source: 'adjustment', sourceId: null, createdAt: atDay(100) },
  { id: 'move-opening-pen', productId: 'prod-pen', productName: 'Blue Ball Pen (Box)', quantityDelta: 20, reason: 'Opening stock', source: 'adjustment', sourceId: null, createdAt: atDay(90) },
  { id: 'move-opening-tape', productId: 'prod-tape', productName: 'Packing Tape 2 in', quantityDelta: 5, reason: 'Opening stock', source: 'adjustment', sourceId: null, createdAt: atDay(80) },
  { id: 'move-opening-roll', productId: 'prod-roll', productName: 'Thermal Receipt Roll', quantityDelta: 6, reason: 'Opening stock', source: 'adjustment', sourceId: null, createdAt: atDay(75) },
  { id: 'move-opening-envelope', productId: 'prod-envelope', productName: 'Courier Envelope', quantityDelta: 64, reason: 'Opening stock', source: 'adjustment', sourceId: null, createdAt: atDay(60) },
  { id: 'move-1048', productId: 'prod-paper', productName: 'A4 Copier Paper', quantityDelta: -3, reason: 'Sale INV-1048', source: 'sale', sourceId: 'sale-demo-1048', createdAt: atDay(0, 10, 42) },
  { id: 'move-1047', productId: 'prod-pen', productName: 'Blue Ball Pen (Box)', quantityDelta: -2, reason: 'Sale INV-1047', source: 'sale', sourceId: 'sale-demo-1047', createdAt: atDay(0, 9, 18) },
  { id: 'move-1046', productId: 'prod-tape', productName: 'Packing Tape 2 in', quantityDelta: -5, reason: 'Sale INV-1046', source: 'sale', sourceId: 'sale-demo-1046', createdAt: atDay(1, 16, 20) },
  { id: 'move-1045', productId: 'prod-paper', productName: 'A4 Copier Paper', quantityDelta: -2, reason: 'Sale INV-1045', source: 'sale', sourceId: 'sale-demo-1045', createdAt: atDay(3, 11, 35) },
  { id: 'move-1044', productId: 'prod-roll', productName: 'Thermal Receipt Roll', quantityDelta: -2, reason: 'Sale INV-1044', source: 'sale', sourceId: 'sale-demo-1044', createdAt: atDay(6, 14, 8) },
  { id: 'move-201', productId: 'prod-paper', productName: 'A4 Copier Paper', quantityDelta: 10, reason: 'Received PUR-0201', source: 'purchase', sourceId: 'purchase-demo-201', createdAt: atDay(4) },
  { id: 'move-202', productId: 'prod-tape', productName: 'Packing Tape 2 in', quantityDelta: 20, reason: 'Received PUR-0202', source: 'purchase', sourceId: 'purchase-demo-202', createdAt: atDay(2) },
  { id: 'move-tape-count', productId: 'prod-tape', productName: 'Packing Tape 2 in', quantityDelta: -13, reason: 'Stock count correction', source: 'adjustment', sourceId: null, createdAt: atDay(0, 18) },
];

const settings: BusinessSettings = {
  id: 'business', businessName: 'Greenleaf General Store', phone: '+91 755 410 2211', address: 'Bhopal, Madhya Pradesh',
  currency: 'INR', taxEnabled: false, taxRateBps: 0, defaultReorderPoint: 10, theme: 'light', demoData: true, updatedAt: atDay(0),
};
const demoAuditEvents: AuditEvent[] = [];

export const emptySnapshot = (): LedgerSnapshot => ({
  products: [], categories: [], customers: [], suppliers: [], sales: [], saleItems: [], purchases: [], purchaseItems: [],
  payments: [], stockMovements: [], auditEvents: [],
  settings: { id: 'business', businessName: 'My Shop', phone: '', address: '', currency: 'INR', taxEnabled: false, taxRateBps: 0, defaultReorderPoint: 10, theme: 'light', demoData: false, updatedAt: new Date().toISOString() },
});

export const makeDemoSnapshot = (): LedgerSnapshot => ({
  products: structuredClone(demoProducts), categories: structuredClone(demoCategories), customers: structuredClone(demoCustomers),
  suppliers: structuredClone(demoSuppliers), sales: structuredClone(demoSales), saleItems: structuredClone(demoSaleItems),
  purchases: structuredClone(demoPurchases), purchaseItems: structuredClone(demoPurchaseItems), payments: structuredClone(demoPayments),
  stockMovements: structuredClone(demoStockMovements), auditEvents: structuredClone(demoAuditEvents), settings: structuredClone(settings),
});

export async function seedDemoData(db: LedgerDatabase): Promise<void> {
  const snapshot = makeDemoSnapshot();
  await db.transaction('rw', [db.products, db.categories, db.customers, db.suppliers, db.sales, db.saleItems, db.purchases, db.purchaseItems, db.payments, db.stockMovements, db.auditEvents, db.settings], async () => {
    await Promise.all([
      db.products.bulkPut(snapshot.products), db.categories.bulkPut(snapshot.categories), db.customers.bulkPut(snapshot.customers),
      db.suppliers.bulkPut(snapshot.suppliers), db.sales.bulkPut(snapshot.sales), db.saleItems.bulkPut(snapshot.saleItems),
      db.purchases.bulkPut(snapshot.purchases), db.purchaseItems.bulkPut(snapshot.purchaseItems), db.payments.bulkPut(snapshot.payments),
      db.stockMovements.bulkPut(snapshot.stockMovements), db.auditEvents.bulkPut(snapshot.auditEvents), db.settings.put(snapshot.settings),
    ]);
  });
}

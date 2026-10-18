export type EntityId = string;
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank' | 'other';
export type PaymentDirection = 'in' | 'out';
export type PurchaseStatus = 'draft' | 'received' | 'cancelled';
export type SaleStatus = 'paid' | 'partial' | 'unpaid';

export interface Product {
  id: EntityId;
  name: string;
  sku: string;
  categoryId: EntityId | null;
  categoryName: string;
  unit: string;
  costMinor: number;
  priceMinor: number;
  quantity: number;
  reorderPoint: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: EntityId;
  name: string;
  createdAt: string;
}

export interface Customer {
  id: EntityId;
  name: string;
  address: string;
  phone: string;
  email: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: EntityId;
  name: string;
  phone: string;
  email: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sale {
  id: EntityId;
  invoiceNo: string;
  operationKey: string;
  customerId: EntityId | null;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  createdAt: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  taxRateBps: number;
  totalMinor: number;
}

export interface SaleItem {
  id: EntityId;
  saleId: EntityId;
  productId: EntityId;
  productName: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  unitCostMinor: number;
  lineSubtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface Purchase {
  id: EntityId;
  reference: string;
  supplierId: EntityId;
  supplierName: string;
  status: PurchaseStatus;
  createdAt: string;
  receivedAt: string | null;
  subtotalMinor: number;
  notes: string;
}

export interface PurchaseItem {
  id: EntityId;
  purchaseId: EntityId;
  productId: EntityId;
  productName: string;
  sku: string;
  quantity: number;
  unitCostMinor: number;
  lineTotalMinor: number;
}

export interface Payment {
  id: EntityId;
  direction: PaymentDirection;
  partyType: 'customer' | 'supplier';
  partyId: EntityId;
  saleId: EntityId | null;
  purchaseId: EntityId | null;
  amountMinor: number;
  method: PaymentMethod;
  operationKey: string;
  createdAt: string;
  note: string;
}

export interface StockMovement {
  id: EntityId;
  productId: EntityId;
  productName: string;
  quantityDelta: number;
  reason: string;
  source: 'sale' | 'purchase' | 'adjustment';
  sourceId: EntityId | null;
  createdAt: string;
}

export interface BusinessSettings {
  id: 'business';
  businessName: string;
  phone: string;
  address: string;
  currency: 'INR';
  taxEnabled: boolean;
  taxRateBps: number;
  defaultReorderPoint: number;
  theme: 'light' | 'system';
  demoData: boolean;
  setupComplete: boolean;
  checklistDismissed: boolean;
  updatedAt: string;
}

export interface AuditEvent {
  id: EntityId;
  eventType: string;
  entityType: string;
  entityId: EntityId;
  summary: string;
  createdAt: string;
}

export interface OperationRecord {
  id: string;
  resultId: EntityId;
  createdAt: string;
}

export interface LedgerSnapshot {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  suppliers: Supplier[];
  sales: Sale[];
  saleItems: SaleItem[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  payments: Payment[];
  stockMovements: StockMovement[];
  auditEvents: AuditEvent[];
  settings: BusinessSettings;
}

export interface SaleLineInput {
  productId: EntityId;
  quantity: number;
}

export interface NewSaleCustomer {
  name: string;
  phone: string;
  email: string;
  address?: string;
}

export interface PurchaseLineInput {
  productId: EntityId;
  quantity: number;
  unitCostMinor: number;
}

export interface RecordSaleInput {
  operationKey: string;
  customerId: EntityId | null;
  newCustomer?: NewSaleCustomer;
  lines: SaleLineInput[];
  discountMinor: number;
  taxRateBps: number;
  paidMinor: number;
  method: PaymentMethod;
}

export interface CreatePurchaseInput {
  supplierId: EntityId;
  lines: PurchaseLineInput[];
  notes: string;
  status: 'draft' | 'received';
  paidMinor: number;
  method: PaymentMethod;
  operationKey: string;
}

export interface PartyBalance {
  partyId: EntityId;
  partyName: string;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
}

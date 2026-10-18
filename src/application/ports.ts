import type {
  BusinessSettings,
  Category,
  CreatePurchaseInput,
  Customer,
  LedgerSnapshot,
  PaymentMethod,
  Product,
  RecordSaleInput,
  Supplier,
} from '../domain/models';

export type NewProduct = Pick<Product, 'name' | 'sku' | 'categoryName' | 'unit' | 'costMinor' | 'priceMinor' | 'quantity' | 'reorderPoint'>;
export type NewCustomer = Pick<Customer, 'name' | 'address' | 'phone' | 'email' | 'notes'>;
export type NewSupplier = Pick<Supplier, 'name' | 'phone' | 'email' | 'notes'>;
export type NewCategory = Pick<Category, 'name'>;

export interface LedgerRepository {
  initialize(): Promise<void>;
  getSnapshot(): Promise<LedgerSnapshot>;
  subscribe(listener: () => void): () => void;
  addProduct(input: NewProduct): Promise<Product>;
  updateProduct(product: Product): Promise<void>;
  archiveProduct(productId: string): Promise<void>;
  addCategory(input: NewCategory): Promise<Category>;
  addCustomer(input: NewCustomer): Promise<Customer>;
  updateCustomer(customer: Customer): Promise<void>;
  archiveCustomer(customerId: string): Promise<void>;
  addSupplier(input: NewSupplier): Promise<Supplier>;
  updateSupplier(supplier: Supplier): Promise<void>;
  archiveSupplier(supplierId: string): Promise<void>;
  adjustStock(productId: string, delta: number, reason: string): Promise<void>;
  recordSale(input: RecordSaleInput): Promise<string>;
  recordSalePayment(input: { saleId: string; amountMinor: number; method: import('../domain/models').PaymentMethod; note: string; operationKey: string }): Promise<void>;
  createPurchase(input: CreatePurchaseInput): Promise<string>;
  receivePurchase(purchaseId: string): Promise<void>;
  cancelPurchase(purchaseId: string): Promise<void>;
  recordPartyPayment(input: { partyType: 'customer' | 'supplier'; partyId: string; amountMinor: number; method: PaymentMethod; note: string; operationKey: string }): Promise<void>;
  updateSettings(settings: BusinessSettings): Promise<void>;
  importBackup(data: LedgerSnapshot): Promise<void>;
  resetDemoData(): Promise<void>;
}

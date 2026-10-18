import { z } from 'zod';

const id = z.string().min(1).max(120);
const isoDate = z.string().datetime({ offset: true });
const minor = z.number().int().safe().min(0);

export const productSchema = z.object({
  id, name: z.string().trim().min(1).max(140), sku: z.string().trim().max(64),
  categoryId: id.nullable(), categoryName: z.string().max(80), unit: z.string().trim().min(1).max(24),
  costMinor: minor, priceMinor: minor, quantity: z.number().int().safe().min(0), reorderPoint: z.number().int().safe().min(0),
  archived: z.boolean(), createdAt: isoDate, updatedAt: isoDate,
});
export const categorySchema = z.object({ id, name: z.string().trim().min(1).max(80), createdAt: isoDate });
export const customerSchema = z.object({
  id, name: z.string().trim().min(1).max(140), address: z.string().max(300).default(''), phone: z.string().max(40), email: z.string().max(200), notes: z.string().max(1000),
  archived: z.boolean(), createdAt: isoDate, updatedAt: isoDate,
});
export const supplierSchema = z.object({
  id, name: z.string().trim().min(1).max(140), phone: z.string().max(40), email: z.string().max(200), notes: z.string().max(1000),
  archived: z.boolean(), createdAt: isoDate, updatedAt: isoDate,
});
export const saleCustomerInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter the customer name.').max(140),
  address: z.string().trim().max(300).optional().default(''),
  phone: z.string().trim().min(1, 'Enter the customer phone number.').max(40),
  email: z.string().trim().min(1, 'Enter the customer email address.').email('Enter a valid customer email address.').max(200),
});
export const saleSchema = z.object({
  id, invoiceNo: z.string().min(1).max(64), operationKey: id, customerId: id.nullable(), customerName: z.string().max(140),
  customerAddress: z.string().max(300).optional(), customerPhone: z.string().max(40).optional(), customerEmail: z.string().max(200).optional(),
  createdAt: isoDate, subtotalMinor: minor, discountMinor: minor, taxMinor: minor, taxRateBps: z.number().int().min(0).max(10000), totalMinor: minor,
});
export const saleItemSchema = z.object({
  id, saleId: id, productId: id, productName: z.string().min(1).max(140), sku: z.string().max(64),
  quantity: z.number().int().safe().positive(), unitPriceMinor: minor, unitCostMinor: minor, lineSubtotalMinor: minor,
  discountMinor: minor, taxMinor: minor, lineTotalMinor: minor,
});
export const purchaseSchema = z.object({
  id, reference: z.string().min(1).max(64), supplierId: id, supplierName: z.string().min(1).max(140),
  status: z.enum(['draft', 'received', 'cancelled']), createdAt: isoDate, receivedAt: isoDate.nullable(),
  subtotalMinor: minor, notes: z.string().max(1000),
});
export const purchaseItemSchema = z.object({
  id, purchaseId: id, productId: id, productName: z.string().min(1).max(140), sku: z.string().max(64),
  quantity: z.number().int().safe().positive(), unitCostMinor: minor, lineTotalMinor: minor,
});
export const paymentSchema = z.object({
  id, direction: z.enum(['in', 'out']), partyType: z.enum(['customer', 'supplier']), partyId: id,
  saleId: id.nullable(), purchaseId: id.nullable(), amountMinor: z.number().int().safe().positive(),
  method: z.enum(['cash', 'upi', 'card', 'bank', 'other']), operationKey: id, createdAt: isoDate, note: z.string().max(500),
});
export const stockMovementSchema = z.object({
  id, productId: id, productName: z.string().min(1).max(140), quantityDelta: z.number().int().safe().refine((value) => value !== 0),
  reason: z.string().trim().min(1).max(240), source: z.enum(['sale', 'purchase', 'adjustment']), sourceId: id.nullable(), createdAt: isoDate,
});
export const settingsSchema = z.object({
  id: z.literal('business'), businessName: z.string().trim().min(1).max(140), phone: z.string().max(40), address: z.string().max(300),
  currency: z.literal('INR'), taxEnabled: z.boolean(), taxRateBps: z.number().int().min(0).max(10000),
  defaultReorderPoint: z.number().int().min(0).max(100000), theme: z.enum(['light', 'system']), demoData: z.boolean(), updatedAt: isoDate,
});
export const auditEventSchema = z.object({ id, eventType: z.string().min(1).max(80), entityType: z.string().min(1).max(80), entityId: id, summary: z.string().min(1).max(240), createdAt: isoDate });

export const backupSchema = z.object({
  schemaVersion: z.literal(1), exportedAt: isoDate,
  data: z.object({
    products: z.array(productSchema), categories: z.array(categorySchema), customers: z.array(customerSchema), suppliers: z.array(supplierSchema),
    sales: z.array(saleSchema), saleItems: z.array(saleItemSchema), purchases: z.array(purchaseSchema), purchaseItems: z.array(purchaseItemSchema),
    payments: z.array(paymentSchema), stockMovements: z.array(stockMovementSchema), auditEvents: z.array(auditEventSchema), settings: settingsSchema,
  }).strict(),
}).strict();

export type BackupDocument = z.infer<typeof backupSchema>;

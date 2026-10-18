import type {
  LedgerSnapshot,
  PartyBalance,
  Payment,
  Purchase,
  Sale,
  SaleItem,
} from './models';
import { roundRatio } from './money';

export interface SaleTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  costOfGoodsMinor: number;
  estimatedGrossProfitMinor: number;
  itemAdjustments: Array<{ discountMinor: number; taxMinor: number; lineTotalMinor: number }>;
}

export function calculateSaleTotals(
  lines: Array<{ quantity: number; unitPriceMinor: number; unitCostMinor: number }>,
  discountMinor: number,
  taxRateBps: number,
): SaleTotals {
  if (lines.length === 0) throw new Error('Add at least one product to the sale.');
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0) throw new Error('Discount must be a non-negative amount.');
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) throw new Error('Tax rate is outside the supported range.');
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error('Quantity must be a positive whole number.');
    if (![line.unitPriceMinor, line.unitCostMinor].every(Number.isSafeInteger) || line.unitPriceMinor < 0 || line.unitCostMinor < 0) {
      throw new Error('Product prices must be valid non-negative currency amounts.');
    }
  }

  const subtotalMinor = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
  if (!Number.isSafeInteger(subtotalMinor)) throw new Error('Sale subtotal is outside the supported currency range.');
  if (discountMinor > subtotalMinor) throw new Error('Discount cannot exceed the sale subtotal.');
  const costOfGoodsMinor = lines.reduce((sum, line) => sum + line.quantity * line.unitCostMinor, 0);
  if (!Number.isSafeInteger(costOfGoodsMinor)) throw new Error('Sale cost is outside the supported currency range.');

  let allocatedDiscount = 0;
  const itemAdjustments = lines.map((line, index) => {
    const lineSubtotal = line.quantity * line.unitPriceMinor;
    const lineDiscount = subtotalMinor === 0
      ? 0
      : index === lines.length - 1
      ? discountMinor - allocatedDiscount
      : Number((BigInt(discountMinor) * BigInt(lineSubtotal)) / BigInt(subtotalMinor));
    allocatedDiscount += lineDiscount;
    const taxableMinor = lineSubtotal - lineDiscount;
    const taxMinor = roundRatio(taxableMinor, taxRateBps, 10000);
    return { discountMinor: lineDiscount, taxMinor, lineTotalMinor: taxableMinor + taxMinor };
  });
  const taxMinor = itemAdjustments.reduce((sum, item) => sum + item.taxMinor, 0);
  const totalMinor = subtotalMinor - discountMinor + taxMinor;
  if (!Number.isSafeInteger(totalMinor)) throw new Error('Sale total is outside the supported currency range.');
  const estimatedGrossProfitMinor = subtotalMinor - discountMinor - costOfGoodsMinor;
  if (!Number.isSafeInteger(estimatedGrossProfitMinor)) throw new Error('Estimated gross profit is outside the supported currency range.');

  return {
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor,
    costOfGoodsMinor,
    estimatedGrossProfitMinor,
    itemAdjustments,
  };
}

export function salePaidMinor(sale: Sale, payments: Payment[]): number {
  return payments.filter((payment) => payment.direction === 'in' && payment.saleId === sale.id)
    .reduce((sum, payment) => sum + payment.amountMinor, 0);
}

export function customerBalances(snapshot: Pick<LedgerSnapshot, 'customers' | 'sales' | 'payments'>): PartyBalance[] {
  return snapshot.customers.map((customer) => {
    const sales = snapshot.sales.filter((sale) => sale.customerId === customer.id);
    const totalMinor = sales.reduce((sum, sale) => sum + sale.totalMinor, 0);
    const paidMinor = snapshot.payments
      .filter((payment) => payment.direction === 'in' && payment.partyId === customer.id)
      .reduce((sum, payment) => sum + payment.amountMinor, 0);
    return { partyId: customer.id, partyName: customer.name, totalMinor, paidMinor, balanceMinor: Math.max(0, totalMinor - paidMinor) };
  });
}

export function supplierBalances(snapshot: Pick<LedgerSnapshot, 'suppliers' | 'purchases' | 'payments'>): PartyBalance[] {
  return snapshot.suppliers.map((supplier) => {
    const purchases = snapshot.purchases.filter((purchase) => purchase.supplierId === supplier.id && purchase.status === 'received');
    const totalMinor = purchases.reduce((sum, purchase) => sum + purchase.subtotalMinor, 0);
    const paidMinor = snapshot.payments
      .filter((payment) => payment.direction === 'out' && payment.partyId === supplier.id)
      .reduce((sum, payment) => sum + payment.amountMinor, 0);
    return { partyId: supplier.id, partyName: supplier.name, totalMinor, paidMinor, balanceMinor: Math.max(0, totalMinor - paidMinor) };
  });
}

export function purchaseBalance(purchase: Purchase, payments: Payment[]): number {
  const paid = payments.filter((payment) => payment.direction === 'out' && payment.purchaseId === purchase.id)
    .reduce((sum, payment) => sum + payment.amountMinor, 0);
  return Math.max(0, purchase.subtotalMinor - paid);
}

export function saleStatus(sale: Sale, payments: Payment[]): 'paid' | 'partial' | 'unpaid' {
  const paid = salePaidMinor(sale, payments);
  if (paid >= sale.totalMinor) return 'paid';
  return paid > 0 ? 'partial' : 'unpaid';
}

export function estimatedGrossProfit(sales: Sale[], items: SaleItem[]): number {
  const bySale = new Map<string, SaleItem[]>();
  for (const item of items) bySale.set(item.saleId, [...(bySale.get(item.saleId) ?? []), item]);
  return sales.reduce((sum, sale) => {
    const saleItems = bySale.get(sale.id) ?? [];
    return sum + sale.subtotalMinor - sale.discountMinor - saleItems.reduce((cost, item) => cost + item.quantity * item.unitCostMinor, 0);
  }, 0);
}

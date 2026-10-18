import { estimatedGrossProfit } from '../domain/calculations';
import type { LedgerSnapshot } from '../domain/models';

export interface PeriodSummary {
  salesMinor: number;
  transactions: number;
  grossProfitMinor: number;
}

export function summarizePeriod(snapshot: LedgerSnapshot, from: Date, through: Date): PeriodSummary {
  const sales = snapshot.sales.filter((sale) => {
    const date = new Date(sale.createdAt);
    return date >= from && date <= through;
  });
  const ids = new Set(sales.map((sale) => sale.id));
  return {
    salesMinor: sales.reduce((sum, sale) => sum + sale.subtotalMinor - sale.discountMinor, 0),
    transactions: sales.length,
    grossProfitMinor: estimatedGrossProfit(sales, snapshot.saleItems.filter((item) => ids.has(item.saleId))),
  };
}

export function inventoryValueMinor(snapshot: LedgerSnapshot): number {
  return snapshot.products.filter((product) => !product.archived).reduce((sum, product) => sum + product.quantity * product.costMinor, 0);
}

export function topProducts(snapshot: LedgerSnapshot, limit = 5): Array<{ productId: string; name: string; quantity: number; salesMinor: number }> {
  const totals = new Map<string, { name: string; quantity: number; salesMinor: number }>();
  for (const item of snapshot.saleItems) {
    const row = totals.get(item.productId) ?? { name: item.productName, quantity: 0, salesMinor: 0 };
    row.quantity += item.quantity;
    row.salesMinor += item.lineTotalMinor;
    totals.set(item.productId, row);
  }
  return [...totals.entries()].map(([productId, data]) => ({ productId, ...data })).sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

export function trendByDay(snapshot: LedgerSnapshot, days: number): Array<{ label: string; date: string; salesMinor: number; profitMinor: number }> {
  const today = new Date();
  const result: Array<{ label: string; date: string; salesMinor: number; profitMinor: number }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    date.setHours(0, 0, 0, 0);
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    const daySales = snapshot.sales.filter((sale) => new Date(sale.createdAt) >= date && new Date(sale.createdAt) < next);
    const saleIds = new Set(daySales.map((sale) => sale.id));
    result.push({
      label: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date),
      date: date.toISOString(),
      salesMinor: daySales.reduce((sum, sale) => sum + sale.subtotalMinor - sale.discountMinor, 0),
      profitMinor: estimatedGrossProfit(daySales, snapshot.saleItems.filter((item) => saleIds.has(item.saleId))),
    });
  }
  return result;
}

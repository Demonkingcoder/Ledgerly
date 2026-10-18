import { describe, expect, it } from 'vitest';
import { calculateSaleTotals, customerBalances, supplierBalances } from '../src/domain/calculations';
import { formatMoney, parseMoneyInput } from '../src/domain/money';
import { makeDemoSnapshot } from '../src/infrastructure/local/demo-data';
import { answerBusinessQuestion } from '../src/features/assistant/answer-question';

describe('currency values', () => {
  it('parses INR input into integer paise without floating point arithmetic', () => {
    expect(parseMoneyInput('1,234.50')).toBe(123450);
    expect(parseMoneyInput('0.1')).toBe(10);
    expect(parseMoneyInput('-1.00')).toBeNull();
    expect(parseMoneyInput('4.567')).toBeNull();
    expect(formatMoney(123450)).toContain('1,234.50');
  });

  it('rounds tax and allocates a discount across sale lines exactly', () => {
    const totals = calculateSaleTotals([
      { quantity: 3, unitPriceMinor: 26000, unitCostMinor: 21000 },
      { quantity: 2, unitPriceMinor: 12000, unitCostMinor: 8500 },
    ], 2000, 500);
    expect(totals.subtotalMinor).toBe(102000);
    expect(totals.itemAdjustments.reduce((sum, line) => sum + line.discountMinor, 0)).toBe(2000);
    expect(totals.taxMinor).toBe(5000);
    expect(totals.totalMinor).toBe(105000);
    expect(totals.estimatedGrossProfitMinor).toBe(20000);
  });

  it('allows a zero-price sale without dividing by a zero subtotal', () => {
    const totals = calculateSaleTotals([
      { quantity: 1, unitPriceMinor: 0, unitCostMinor: 0 },
      { quantity: 2, unitPriceMinor: 0, unitCostMinor: 0 },
    ], 0, 1800);
    expect(totals).toMatchObject({ subtotalMinor: 0, discountMinor: 0, taxMinor: 0, totalMinor: 0 });
    expect(totals.itemAdjustments.map((line) => line.lineTotalMinor)).toEqual([0, 0]);
  });

  it('rejects a sale whose frozen cost total exceeds the safe currency range', () => {
    expect(() => calculateSaleTotals([
      { quantity: 2, unitPriceMinor: 0, unitCostMinor: Number.MAX_SAFE_INTEGER },
    ], 0, 0)).toThrow('Sale cost is outside the supported currency range');
  });

  it('rejects invalid discounts and quantities', () => {
    expect(() => calculateSaleTotals([{ quantity: 1, unitPriceMinor: 100, unitCostMinor: 50 }], 101, 0)).toThrow('Discount cannot exceed');
    expect(() => calculateSaleTotals([{ quantity: 0, unitPriceMinor: 100, unitCostMinor: 50 }], 0, 0)).toThrow('Quantity');
  });
});

describe('derived balances and assistant answers', () => {
  it('derives customer and supplier balances from transactions and payments', () => {
    const snapshot = makeDemoSnapshot();
    expect(customerBalances(snapshot).find((row) => row.partyId === 'customer-meera')?.balanceMinor).toBe(15000);
    expect(supplierBalances(snapshot).find((row) => row.partyId === 'supplier-bhopal')?.balanceMinor).toBe(60000);
  });

  it('answers supported questions from actual local records and rejects unsupported ones honestly', () => {
    const snapshot = makeDemoSnapshot();
    expect(answerBusinessQuestion('which products need reordering?', snapshot)).toContain('Thermal Receipt Roll');
    expect(answerBusinessQuestion('what sold best?', snapshot)).toContain('A4 Copier Paper');
    expect(answerBusinessQuestion('what is my horoscope?', snapshot)).toContain('not have enough information');
  });

  it('ranks best-selling products for the requested week instead of all time', () => {
    const snapshot = makeDemoSnapshot();
    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    snapshot.sales = snapshot.sales.map((sale) => ({ ...sale, createdAt: oldDate }));
    const recentSale = { ...snapshot.sales[0], id: 'sale-recent', invoiceNo: 'INV-RECENT', operationKey: 'recent-sale', createdAt: new Date().toISOString() };
    snapshot.sales.push(recentSale);
    snapshot.saleItems.push({ ...snapshot.saleItems.find((item) => item.productId === 'prod-roll')!, id: 'item-recent', saleId: recentSale.id, quantity: 20 });

    expect(answerBusinessQuestion('What sold best this week?', snapshot)).toContain('Thermal Receipt Roll (20 units)');
    expect(answerBusinessQuestion('What sold best this week?', snapshot)).toContain('last 7 days');
    expect(answerBusinessQuestion('What sold best?', snapshot)).toContain('A4 Copier Paper');
  });
});

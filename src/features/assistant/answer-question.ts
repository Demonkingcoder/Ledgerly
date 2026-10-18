import { customerBalances, estimatedGrossProfit, supplierBalances } from '../../domain/calculations';
import type { LedgerSnapshot } from '../../domain/models';
import { formatMoney } from '../../domain/money';
import { topProducts } from '../../application/analytics';

export function answerBusinessQuestion(question: string, snapshot: LedgerSnapshot): string {
  const query = question.trim().toLowerCase();
  if (!query) return 'Ask about sales, top products, reordering, customer balances, supplier payables, or a recent summary.';

  if (/reorder|restock|low stock|running low|need to order|out of stock/.test(query)) {
    const low = snapshot.products.filter((product) => !product.archived && product.quantity <= product.reorderPoint).sort((a, b) => a.quantity - b.quantity);
    if (!low.length) return 'No active products are at or below their reorder point.';
    return `Review these ${low.length} products: ${low.slice(0, 5).map((product) => `${product.name} (${product.quantity} ${product.unit}, reorder at ${product.reorderPoint})`).join('; ')}.`;
  }

  if (/customer|receivable|owe me|owed|dues/.test(query)) {
    const balances = customerBalances(snapshot).filter((row) => row.balanceMinor > 0).sort((a, b) => b.balanceMinor - a.balanceMinor);
    const total = balances.reduce((sum, row) => sum + row.balanceMinor, 0);
    return balances.length
      ? `Customers owe ${formatMoney(total)} across ${balances.length} account${balances.length === 1 ? '' : 's'}. Largest balance: ${balances[0].partyName} at ${formatMoney(balances[0].balanceMinor)}.`
      : 'There are no outstanding customer balances in the saved records.';
  }

  if (/supplier|payable|owe supplier|owe suppliers/.test(query)) {
    const balances = supplierBalances(snapshot).filter((row) => row.balanceMinor > 0).sort((a, b) => b.balanceMinor - a.balanceMinor);
    const total = balances.reduce((sum, row) => sum + row.balanceMinor, 0);
    return balances.length
      ? `Supplier payables total ${formatMoney(total)} across ${balances.length} supplier${balances.length === 1 ? '' : 's'}. Largest balance: ${balances[0].partyName} at ${formatMoney(balances[0].balanceMinor)}.`
      : 'There are no outstanding supplier balances in the saved records.';
  }

  if (/best|top|popular|selling product|products sold/.test(query)) {
    const thisWeek = /this week|last 7 days|past 7 days/.test(query);
    const rangeStart = new Date();
    if (thisWeek) rangeStart.setDate(rangeStart.getDate() - 6);
    const saleIds = thisWeek
      ? new Set(snapshot.sales.filter((sale) => new Date(sale.createdAt) >= rangeStart).map((sale) => sale.id))
      : undefined;
    const products = topProducts(snapshot, 3, saleIds);
    return products.length
      ? `${thisWeek ? 'Top products by units sold in the last 7 days' : 'Top products by units sold'}: ${products.map((product, index) => `${index + 1}. ${product.name} (${product.quantity} units)`).join('; ')}.`
      : `No sales ${thisWeek ? 'in the last 7 days' : 'have'} been recorded, so there is no product ranking.`;
  }

  if (/sales|revenue|sold/.test(query)) {
    const isToday = /today/.test(query);
    const rangeStart = new Date();
    if (isToday) rangeStart.setHours(0, 0, 0, 0);
    else rangeStart.setDate(rangeStart.getDate() - 6);
    const sales = snapshot.sales.filter((sale) => new Date(sale.createdAt) >= rangeStart);
    const value = sales.reduce((sum, sale) => sum + sale.subtotalMinor - sale.discountMinor, 0);
    const profit = estimatedGrossProfit(sales, snapshot.saleItems.filter((item) => sales.some((sale) => sale.id === item.saleId)));
    return `Recorded ${isToday ? 'today' : 'in the last 7 days'}: ${formatMoney(value)} gross sales after discounts across ${sales.length} transaction${sales.length === 1 ? '' : 's'}. Estimated gross profit is ${formatMoney(profit)} before other expenses.`;
  }

  if (/summary|performance|profit|business/.test(query)) {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const sales = snapshot.sales.filter((sale) => new Date(sale.createdAt) >= start);
    const profit = estimatedGrossProfit(sales, snapshot.saleItems.filter((item) => sales.some((sale) => sale.id === item.saleId)));
    const receivables = customerBalances(snapshot).reduce((sum, row) => sum + row.balanceMinor, 0);
    const payables = supplierBalances(snapshot).reduce((sum, row) => sum + row.balanceMinor, 0);
    const lowCount = snapshot.products.filter((product) => !product.archived && product.quantity <= product.reorderPoint).length;
    return `Last 7 days: ${formatMoney(sales.reduce((sum, sale) => sum + sale.subtotalMinor - sale.discountMinor, 0))} in sales, estimated gross profit ${formatMoney(profit)}, ${lowCount} products at reorder point, ${formatMoney(receivables)} customer receivables and ${formatMoney(payables)} supplier payables.`;
  }

  return 'I can answer about sales today or this week, best-selling products, low stock, customer balances, supplier payables, and a recent summary. I do not have enough information to answer that question.';
}

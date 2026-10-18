import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useLedger } from '../../app/ledger-context';
import { useToast } from '../../components/toast';
import { PageHeading, Panel, StatCard } from '../../components/ui';
import { customerBalances, estimatedGrossProfit, supplierBalances } from '../../domain/calculations';
import { formatMoney } from '../../domain/money';
import { formatDate } from '../../shared/format';
import { inventoryValueMinor, trendByDay } from '../../application/analytics';

export function ReportsPage() {
  const { snapshot } = useLedger();
  const notify = useToast();
  const [days, setDays] = useState(30);
  const chart = useMemo(() => trendByDay(snapshot, Math.min(days, 30)), [snapshot, days]);
  const start = new Date(); start.setDate(start.getDate() - days + 1); start.setHours(0, 0, 0, 0);
  const sales = snapshot.sales.filter((sale) => new Date(sale.createdAt) >= start);
  const ids = new Set(sales.map((sale) => sale.id));
  const items = snapshot.saleItems.filter((item) => ids.has(item.saleId));
  const grossSales = sales.reduce((sum, sale) => sum + sale.subtotalMinor, 0);
  const discount = sales.reduce((sum, sale) => sum + sale.discountMinor, 0);
  const taxes = sales.reduce((sum, sale) => sum + sale.taxMinor, 0);
  const netSales = grossSales - discount;
  const cogs = items.reduce((sum, item) => sum + item.quantity * item.unitCostMinor, 0);
  const grossProfit = estimatedGrossProfit(sales, items);
  const receivables = customerBalances(snapshot).reduce((sum, row) => sum + row.balanceMinor, 0);
  const payables = supplierBalances(snapshot).reduce((sum, row) => sum + row.balanceMinor, 0);
  const top = useMemo(() => {
    const aggregate = new Map<string, { name: string; quantity: number; value: number }>();
    items.forEach((item) => { const current = aggregate.get(item.productId) ?? { name: item.productName, quantity: 0, value: 0 }; current.quantity += item.quantity; current.value += item.lineTotalMinor; aggregate.set(item.productId, current); });
    return [...aggregate.entries()].map(([productId, data]) => ({ productId, ...data })).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [items]);

  function exportCsv() {
    const headers = ['Invoice', 'Date', 'Customer', 'Gross sales paise', 'Discount paise', 'Tax paise', 'Total paise', 'Paid paise', 'Due paise', 'Estimated gross profit paise'];
    const rows = sales.map((sale) => {
      const paid = snapshot.payments.filter((payment) => payment.saleId === sale.id && payment.direction === 'in').reduce((sum, payment) => sum + payment.amountMinor, 0);
      const saleItems = snapshot.saleItems.filter((item) => item.saleId === sale.id);
      const profit = sale.subtotalMinor - sale.discountMinor - saleItems.reduce((sum, item) => sum + item.quantity * item.unitCostMinor, 0);
      return [sale.invoiceNo, sale.createdAt, sale.customerName, sale.subtotalMinor, sale.discountMinor, sale.taxMinor, sale.totalMinor, paid, Math.max(0, sale.totalMinor - paid), profit];
    });
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ledgerly-sales-${days}-days.csv`; anchor.click(); URL.revokeObjectURL(url);
    notify('Sales report downloaded as CSV.');
  }

  return <>
    <PageHeading eyebrow="BUSINESS PERFORMANCE" title="Reports" description="Sales and stock reports use records saved in this local workspace." actions={<button className="button button-secondary" onClick={exportCsv}><Download size={16} />Export sales CSV</button>} />
    <div className="report-controls"><div className="period-select"><span>Reporting period</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></div><small>{formatDate(start.toISOString())} — {formatDate(new Date().toISOString())}</small></div>
    <div className="stat-grid report-stats"><StatCard label="Gross sales" value={formatMoney(grossSales)} hint={`${sales.length} recorded transactions`} icon={FileSpreadsheet} tone="green" /><StatCard label="Estimated gross profit" value={formatMoney(grossProfit)} hint="Net sales less recorded item costs" icon={FileSpreadsheet} tone="lime" /><StatCard label="Inventory at cost" value={formatMoney(inventoryValueMinor(snapshot))} hint="Active on-hand quantity × current cost" icon={FileSpreadsheet} tone="blue" /><StatCard label="Open receivables & payables" value={formatMoney(receivables + payables)} hint={`${formatMoney(receivables)} due from customers · ${formatMoney(payables)} due to suppliers`} icon={FileSpreadsheet} tone="orange" /></div>
    <div className="reports-grid"><Panel><div className="panel-heading"><div><h2>Sales trend</h2><p>Net sales after discounts by day</p></div></div><div className="chart-wrap report-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}><defs><linearGradient id="reportFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1c7c61" stopOpacity={0.17} /><stop offset="100%" stopColor="#1c7c61" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0ea" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#89948b', fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#89948b', fontSize: 10 }} tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`} width={46} /><Tooltip formatter={(value) => [formatMoney(Number(value)), 'Net sales']} contentStyle={{ border: '1px solid #e5e9e2', borderRadius: 10 }} /><Area type="monotone" dataKey="salesMinor" stroke="#287d63" strokeWidth={2.5} fill="url(#reportFill)" /></AreaChart></ResponsiveContainer></div></Panel>
      <Panel><div className="panel-heading"><div><h2>Sales calculation</h2><p>Selected period totals</p></div></div><div className="calculation-list"><div><span>Gross item sales</span><strong>{formatMoney(grossSales)}</strong></div><div><span>Discounts</span><strong>− {formatMoney(discount)}</strong></div><div><span>Net sales before tax</span><strong>{formatMoney(netSales)}</strong></div><div><span>Tax collected</span><strong>{formatMoney(taxes)}</strong></div><div><span>Cost of goods sold</span><strong>− {formatMoney(cogs)}</strong></div><div className="calculation-total"><span>Estimated gross profit</span><strong>{formatMoney(grossProfit)}</strong></div></div><p className="calculation-note">Gross profit excludes rent, wages, fees, returns, and other operating expenses. Tax is shown separately and is not counted as sales.</p></Panel></div>
    <div className="reports-grid reports-grid-bottom"><Panel><div className="panel-heading"><div><h2>Top products</h2><p>Units sold during the selected period</p></div></div>{top.length ? <div className="rank-list">{top.map((product, index) => <div className="rank-row" key={product.productId}><span className="rank-number">0{index + 1}</span><div><strong>{product.name}</strong><small>{product.quantity} units</small></div><span>{formatMoney(product.value)}</span></div>)}</div> : <div className="empty-inline">No product sales in this period.</div>}</Panel>
      <Panel><div className="panel-heading"><div><h2>Purchase spending</h2><p>Received purchases during the selected period</p></div></div><div className="calculation-list"><div><span>Received purchase total</span><strong>{formatMoney(snapshot.purchases.filter((purchase) => purchase.status === 'received' && new Date(purchase.receivedAt ?? purchase.createdAt) >= start).reduce((sum, purchase) => sum + purchase.subtotalMinor, 0))}</strong></div><div><span>Customer receivables</span><strong>{formatMoney(receivables)}</strong></div><div><span>Supplier payables</span><strong>{formatMoney(payables)}</strong></div><div><span>Current inventory at cost</span><strong>{formatMoney(inventoryValueMinor(snapshot))}</strong></div></div></Panel></div>
  </>;
}

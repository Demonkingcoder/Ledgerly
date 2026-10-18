import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CircleDollarSign, Package, Plus, ShoppingBag, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLedger } from '../../app/ledger-context';
import { EmptyState, PageHeading, Panel, StatCard, StatusBadge } from '../../components/ui';
import { customerBalances, estimatedGrossProfit, saleStatus, supplierBalances } from '../../domain/calculations';
import { formatMoney } from '../../domain/money';
import { formatDate, formatTime, todayStart } from '../../shared/format';
import { topProducts, trendByDay } from '../../application/analytics';

export function DashboardPage() {
  const { snapshot } = useLedger();
  const today = todayStart();
  const todaySales = snapshot.sales.filter((sale) => new Date(sale.createdAt) >= today);
  const todayAmount = todaySales.reduce((sum, sale) => sum + sale.subtotalMinor - sale.discountMinor, 0);
  const todayItems = snapshot.saleItems.filter((item) => todaySales.some((sale) => sale.id === item.saleId));
  const grossProfit = estimatedGrossProfit(todaySales, todayItems);
  const customerDue = customerBalances(snapshot).reduce((sum, row) => sum + row.balanceMinor, 0);
  const supplierDue = supplierBalances(snapshot).reduce((sum, row) => sum + row.balanceMinor, 0);
  const lowStock = snapshot.products.filter((product) => !product.archived && product.quantity <= product.reorderPoint).sort((a, b) => a.quantity - b.quantity);
  const top = topProducts(snapshot, 4);
  const chartData = useMemo(() => trendByDay(snapshot, 7), [snapshot]);

  return <>
    <PageHeading eyebrow={formatDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })} title="Good morning" description="A clear view of how your shop is doing today." actions={<Link className="button button-primary" to="/sales"><Plus size={16} />Record a sale</Link>} />
    {snapshot.settings.demoData && <div className="demo-banner"><span className="demo-spark">✳</span><div><strong>Demo workspace</strong><p>These realistic sample records show how Ledgerly works. Add your own products and transactions as you explore.</p></div><Link to="/settings">Manage data <ArrowRight size={14} /></Link></div>}
    <div className="stat-grid">
      <StatCard label="Sales today" value={formatMoney(todayAmount)} hint={`${todaySales.length} transaction${todaySales.length === 1 ? '' : 's'}`} icon={CircleDollarSign} tone="green" />
      <StatCard label="Estimated gross profit" value={formatMoney(grossProfit)} hint="Sales less item cost, before expenses" icon={TrendingUp} tone="lime" />
      <StatCard label="Products to reorder" value={`${lowStock.length}`} hint={`${snapshot.products.filter((product) => !product.archived && product.quantity === 0).length} out of stock`} icon={Package} tone="orange" />
      <StatCard label="Open balances" value={formatMoney(customerDue + supplierDue)} hint={`${formatMoney(customerDue)} receivable · ${formatMoney(supplierDue)} payable`} icon={ShoppingBag} tone="blue" />
    </div>

    <div className="dashboard-grid">
      <Panel className="chart-panel"><div className="panel-heading"><div><h2>Sales over time</h2><p>Gross sales after discounts · last 7 days</p></div><Link to="/reports" className="text-link">View reports <ArrowRight size={14} /></Link></div>
        {snapshot.sales.length === 0 ? <EmptyState title="Your sales trend will appear here" description="Record your first sale to start building a useful picture of your business." action={<Link to="/sales" className="text-link">Go to sales <ArrowRight size={14} /></Link>} /> : <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1c7c61" stopOpacity={0.17} /><stop offset="100%" stopColor="#1c7c61" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0ea" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#89948b', fontSize: 11 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#89948b', fontSize: 10 }} tickFormatter={(value: number) => value === 0 ? '₹0' : `₹${Math.round(value / 1000)}k`} width={46} /><Tooltip formatter={(value) => [formatMoney(Number(value)), 'Sales']} contentStyle={{ border: '1px solid #e5e9e2', borderRadius: 10, boxShadow: '0 8px 25px #203c3212' }} /><Area type="monotone" dataKey="salesMinor" stroke="#287d63" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{ r: 4, fill: '#287d63' }} /></AreaChart></ResponsiveContainer></div>}
      </Panel>
      <Panel><div className="panel-heading"><div><h2>Stock to review</h2><p>Products at or below reorder point</p></div><Link to="/inventory" className="text-link">Inventory <ArrowRight size={14} /></Link></div>
        {lowStock.length === 0 ? <EmptyState title="Stock levels look good" description="Items that reach their reorder point will appear here." /> : <div className="compact-list">{lowStock.slice(0, 5).map((product) => <div className="compact-row" key={product.id}><span className={`product-mini ${product.quantity === 0 ? 'product-mini-empty' : ''}`}>{product.name.slice(0, 1)}</span><div className="compact-copy"><strong>{product.name}</strong><small>{product.quantity === 0 ? 'Out of stock' : `${product.quantity} ${product.unit} left`} · reorder at {product.reorderPoint}</small></div><StatusBadge tone={product.quantity === 0 ? 'danger' : 'warning'}>{product.quantity === 0 ? 'Out' : 'Low'}</StatusBadge></div>)}</div>}
      </Panel>
    </div>

    <div className="dashboard-grid dashboard-grid-bottom">
      <Panel><div className="panel-heading"><div><h2>Recent sales</h2><p>Latest invoices and payment status</p></div><Link to="/sales" className="text-link">All sales <ArrowRight size={14} /></Link></div>
        {snapshot.sales.length === 0 ? <EmptyState title="No sales yet" description="Create a sale when a customer checks out." action={<Link to="/sales" className="text-link">Record a sale <ArrowRight size={14} /></Link>} /> : <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Time</th><th className="align-right">Total</th><th>Status</th></tr></thead><tbody>{[...snapshot.sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((sale) => { const status = saleStatus(sale, snapshot.payments); return <tr key={sale.id}><td><strong className="table-primary">{sale.invoiceNo}</strong></td><td>{sale.customerName}</td><td className="muted">{new Date(sale.createdAt).toDateString() === new Date().toDateString() ? formatTime(sale.createdAt) : formatDate(sale.createdAt)}</td><td className="align-right">{formatMoney(sale.totalMinor)}</td><td><StatusBadge tone={status === 'paid' ? 'success' : 'warning'}>{status === 'paid' ? 'Paid' : status === 'partial' ? 'Part paid' : 'Unpaid'}</StatusBadge></td></tr>; })}</tbody></table></div>}
      </Panel>
      <Panel><div className="panel-heading"><div><h2>Top products</h2><p>By units sold across saved sales</p></div><Link to="/reports" className="text-link">Product report <ArrowRight size={14} /></Link></div>
        {top.length === 0 ? <EmptyState title="No sales to rank yet" description="Product rankings use saved sale line items." /> : <div className="rank-list">{top.map((product, index) => <div className="rank-row" key={product.productId}><span className="rank-number">0{index + 1}</span><div><strong>{product.name}</strong><small>{product.quantity} units sold</small></div><span>{formatMoney(product.salesMinor)}</span></div>)}</div>}
      </Panel>
    </div>
    <div className="balance-strip"><div><span className="balance-icon receivable">↙</span><div><small>Customer receivables</small><strong>{formatMoney(customerDue)}</strong></div></div><div><span className="balance-icon payable">↗</span><div><small>Supplier payables</small><strong>{formatMoney(supplierDue)}</strong></div></div><Link to="/reports">See balances <ArrowRight size={14} /></Link></div>
  </>;
}

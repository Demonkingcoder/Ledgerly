import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CircleDollarSign, Package, Plus, TrendingUp, ReceiptText, X, Boxes, Wallet, Users, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLedger } from '../../app/ledger-context';
import { EmptyState, PageHeading, Panel, StatCard, StatusBadge } from '../../components/ui';
import { customerBalances, estimatedGrossProfit, saleStatus, supplierBalances } from '../../domain/calculations';
import { formatMoney } from '../../domain/money';
import { formatDate, formatTime, todayStart } from '../../shared/format';
import { topProducts, trendByDay } from '../../application/analytics';

export function DashboardPage() {
  const { snapshot, service } = useLedger();
  const [trendDays, setTrendDays] = useState(7);
  const today = todayStart();
  const todaySales = snapshot.sales.filter((sale) => new Date(sale.createdAt) >= today);
  const todayAmount = todaySales.reduce((sum, sale) => sum + sale.subtotalMinor - sale.discountMinor, 0);
  const todayCollections = snapshot.payments.filter((payment) => payment.direction === 'in' && new Date(payment.createdAt) >= today).reduce((sum, payment) => sum + payment.amountMinor, 0);
  const todayItems = snapshot.saleItems.filter((item) => todaySales.some((sale) => sale.id === item.saleId));
  const grossProfit = estimatedGrossProfit(todaySales, todayItems);
  const customerDue = customerBalances(snapshot).reduce((sum, row) => sum + row.balanceMinor, 0);
  const supplierDue = supplierBalances(snapshot).reduce((sum, row) => sum + row.balanceMinor, 0);
  const lowStock = snapshot.products.filter((product) => !product.archived && product.quantity <= product.reorderPoint).sort((a, b) => a.quantity - b.quantity);
  const top = topProducts(snapshot, 4);
  const chartData = useMemo(() => trendByDay(snapshot, trendDays), [snapshot, trendDays]);
  const checklist = [
    { done: snapshot.products.length > 0, label: 'Add your first product', to: '/inventory', icon: Boxes },
    { done: snapshot.purchases.length > 0, label: 'Record a purchase', to: '/purchases', icon: Package },
    { done: snapshot.sales.length > 0, label: 'Make your first sale', to: '/sales', icon: ReceiptText },
  ];

  async function dismissChecklist() {
    try { await service.updateSettings({ ...snapshot.settings, checklistDismissed: true }); }
    catch { /* Keep the checklist visible if its preference could not be saved. */ }
  }

  return <>
    <PageHeading eyebrow={formatDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })} title="Good morning" description="A clear view of how your shop is doing today." actions={<Link className="button button-primary" to="/sales"><Plus size={16} />Record a sale</Link>} />
    {!snapshot.settings.checklistDismissed && <Panel className="getting-started"><div className="getting-started-heading"><div><p className="eyebrow">GETTING STARTED</p><h2>Make Ledgerly yours</h2><p>Three small steps to get your shop ready.</p></div><button type="button" className="icon-button" aria-label="Dismiss getting started checklist" onClick={() => void dismissChecklist()}><X size={17} /></button></div><div className="checklist-steps">{checklist.map((step, index) => <Link to={step.to} className={`checklist-step ${step.done ? 'checklist-step-done' : ''}`} key={step.label}><span className="checklist-number">{step.done ? '✓' : `0${index + 1}`}</span><span><strong>{step.label}</strong><small>{step.done ? 'Complete' : 'Open this step'}</small></span><step.icon size={17} /></Link>)}</div></Panel>}
    {snapshot.settings.demoData && <div className="demo-banner"><span className="demo-spark">✳</span><div><strong>Demo workspace</strong><p>These realistic sample records show how Ledgerly works. Add your own products and transactions as you explore.</p></div><Link to="/settings">Manage data <ArrowRight size={14} /></Link></div>}
    <div className="stat-grid">
      <StatCard label="Sales today" value={formatMoney(todayAmount)} hint="Sales after discounts, before tax" icon={CircleDollarSign} tone="blue" />
      <StatCard label="Collected today" value={formatMoney(todayCollections)} hint="Payments received today" icon={Wallet} tone="green" />
      <StatCard label="Transactions" value={`${todaySales.length}`} hint="Sales recorded today" icon={ReceiptText} tone="lime" />
      <StatCard label="Estimated gross profit" value={formatMoney(grossProfit)} hint="Sales less item cost, before expenses" icon={TrendingUp} tone="lime" />
      <StatCard label="Products to reorder" value={`${lowStock.length}`} hint={`${snapshot.products.filter((product) => !product.archived && product.quantity === 0).length} out of stock`} icon={Package} tone="orange" />
    </div>

    <div className="dashboard-grid">
      <Panel className="chart-panel"><div className="panel-heading"><div><h2>Sales over time</h2><p>Sales after discounts · last {trendDays} days</p></div><div className="panel-heading-actions"><label className="sr-only" htmlFor="dashboard-trend-days">Sales trend range</label><select id="dashboard-trend-days" className="compact-select" value={trendDays} onChange={(event) => setTrendDays(Number(event.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select><Link to="/reports" className="text-link">Reports <ArrowRight size={14} /></Link></div></div>
        {snapshot.sales.length === 0 ? <EmptyState title="Your sales trend will appear here" description="Record your first sale to start building a useful picture of your business." action={<Link to="/sales" className="text-link">Go to sales <ArrowRight size={14} /></Link>} /> : <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4b64e8" stopOpacity={0.16} /><stop offset="100%" stopColor="#4b64e8" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f5" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#7f8ba0', fontSize: 11 }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#7f8ba0', fontSize: 10 }} tickFormatter={(value: number) => value === 0 ? '₹0' : value >= 100000 ? `₹${Math.round(value / 100000)}k` : `₹${Math.round(value / 100)}`} width={48} /><Tooltip formatter={(value) => [formatMoney(Number(value)), 'Sales after discounts']} labelFormatter={(label, payload) => payload?.[0]?.payload?.date ? formatDate(payload[0].payload.date) : label} contentStyle={{ border: '1px solid #e2e7f0', borderRadius: 10, boxShadow: '0 8px 25px rgb(32 48 82 / 8%)' }} /><Area type="monotone" dataKey="salesMinor" stroke="#4b64e8" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{ r: 4, fill: '#4b64e8' }} /></AreaChart></ResponsiveContainer></div>}
      </Panel>
      <Panel><div className="panel-heading"><div><h2>Stock to review</h2><p>Products at or below reorder point</p></div><Link to="/inventory" className="text-link">Inventory <ArrowRight size={14} /></Link></div>
        {lowStock.length === 0 ? <EmptyState title="Stock levels look good" description="Items that reach their reorder point will appear here." /> : <div className="compact-list">{lowStock.slice(0, 5).map((product) => <div className="compact-row" key={product.id}><span className={`product-mini ${product.quantity === 0 ? 'product-mini-empty' : ''}`}>{product.name.slice(0, 1)}</span><div className="compact-copy"><strong>{product.name}</strong><small>{product.quantity === 0 ? 'Out of stock' : `${product.quantity} ${product.unit} left`} · reorder at {product.reorderPoint}</small></div><StatusBadge tone={product.quantity === 0 ? 'danger' : 'warning'}>{product.quantity === 0 ? 'Out' : 'Low'}</StatusBadge></div>)}</div>}
      </Panel>
    </div>
    <Panel className="action-center"><div className="panel-heading"><div><h2>Action center</h2><p>Items that may need your attention</p></div></div><div className="action-center-grid">
      <Link to="/inventory" className={`action-card ${lowStock.length ? 'action-card-warning' : 'action-card-clear'}`}><span className="action-card-icon"><Package size={17} /></span><span><strong>{lowStock.length ? `${lowStock.length} products need a stock check` : 'Stock levels look good'}</strong><small>{lowStock.length ? 'Review reorder points and availability' : 'No products are at their reorder point'}</small></span><ArrowRight size={16} /></Link>
      <Link to="/customers" className="action-card"><span className="action-card-icon"><Users size={17} /></span><span><strong>{formatMoney(customerDue)} due from customers</strong><small>Open customer balances</small></span><ArrowRight size={16} /></Link>
      <Link to="/suppliers" className="action-card"><span className="action-card-icon"><Store size={17} /></span><span><strong>{formatMoney(supplierDue)} due to suppliers</strong><small>Open supplier balances</small></span><ArrowRight size={16} /></Link>
    </div></Panel>

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

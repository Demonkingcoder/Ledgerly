import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, Printer, Plus, ReceiptText, X } from 'lucide-react';
import { useLedger } from '../../app/ledger-context';
import { useToast } from '../../components/toast';
import { Button, EmptyState, FormActions, FormError, Modal, PageHeading, Panel, SearchInput, StatusBadge } from '../../components/ui';
import { calculateSaleTotals, saleStatus } from '../../domain/calculations';
import type { NewSaleCustomer, PaymentMethod } from '../../domain/models';
import { formatMoney, parseMoneyInput } from '../../domain/money';
import { formatDate, formatTime } from '../../shared/format';

const methods: PaymentMethod[] = ['cash', 'upi', 'card', 'bank', 'other'];
const newCustomerOption = '__add_customer__';

export function SalesPage() {
  const { snapshot } = useLedger();
  const notify = useToast();
  const [search, setSearch] = useState('');
  const [showSale, setShowSale] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [paymentSaleId, setPaymentSaleId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const rows = useMemo(() => snapshot.sales.filter((sale) => {
    const status = saleStatus(sale, snapshot.payments);
    return `${sale.invoiceNo} ${sale.customerName}`.toLowerCase().includes(search.toLowerCase()) && (statusFilter === 'all' || status === statusFilter);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [snapshot, search, statusFilter]);
  const total = snapshot.sales.reduce((sum, sale) => sum + sale.totalMinor, 0);
  const outstanding = snapshot.sales.reduce((sum, sale) => sum + Math.max(0, sale.totalMinor - snapshot.payments.filter((payment) => payment.direction === 'in' && payment.saleId === sale.id).reduce((paid, payment) => paid + payment.amountMinor, 0)), 0);

  return <>
    <PageHeading eyebrow="CHECKOUT & RECEIPTS" title="Sales & billing" description="Record each checkout, keep payments clear, and find any invoice." actions={<Button icon={Plus} onClick={() => setShowSale(true)}>Record a sale</Button>} />
    <div className="mini-stats"><div><span>All recorded sales</span><strong>{formatMoney(total)}</strong></div><div><span>Invoices</span><strong>{snapshot.sales.length}</strong></div><div><span>Customer balances</span><strong>{formatMoney(outstanding)}</strong></div></div>
    <Panel className="table-panel"><div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search invoice or customer" /><label className="select-label"><span className="sr-only">Filter payment status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All payment statuses</option><option value="paid">Paid</option><option value="partial">Part paid</option><option value="unpaid">Unpaid</option></select></label></div>
      {rows.length === 0 ? <EmptyState title={snapshot.sales.length ? 'No matching sales' : 'No sales recorded yet'} description={snapshot.sales.length ? 'Try a different search or payment filter.' : 'Record a checkout to create your first invoice and update stock.'} action={!snapshot.sales.length && <Button icon={Plus} onClick={() => setShowSale(true)}>Record a sale</Button>} /> : <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Items</th><th className="align-right">Total</th><th>Payment</th><th className="align-right">Actions</th></tr></thead><tbody>{rows.map((sale) => {
        const status = saleStatus(sale, snapshot.payments);
        const saleItems = snapshot.saleItems.filter((item) => item.saleId === sale.id);
        const paid = snapshot.payments.filter((payment) => payment.direction === 'in' && payment.saleId === sale.id).reduce((sum, payment) => sum + payment.amountMinor, 0);
        return <tr key={sale.id}><td><strong className="table-primary">{sale.invoiceNo}</strong></td><td>{sale.customerName}</td><td><span>{formatDate(sale.createdAt)}</span><small className="table-subline">{formatTime(sale.createdAt)}</small></td><td>{saleItems.reduce((sum, item) => sum + item.quantity, 0)} units</td><td className="align-right"><strong>{formatMoney(sale.totalMinor)}</strong></td><td><StatusBadge tone={status === 'paid' ? 'success' : 'warning'}>{status === 'paid' ? 'Paid' : status === 'partial' ? `${formatMoney(paid)} paid` : 'Unpaid'}</StatusBadge></td><td className="align-right row-actions"><Button variant="quiet" size="sm" icon={ReceiptText} onClick={() => setReceiptId(sale.id)}>Receipt</Button>{status !== 'paid' && <Button variant="secondary" size="sm" onClick={() => setPaymentSaleId(sale.id)}>Payment</Button>}</td></tr>;
      })}</tbody></table></div>}
    </Panel>
    {showSale && <SaleForm onClose={() => setShowSale(false)} onSaved={(id) => { setShowSale(false); setReceiptId(id); notify('Sale recorded. Stock and payment records were updated.'); }} />}
    {receiptId && <ReceiptModal saleId={receiptId} onClose={() => setReceiptId(null)} />}
    {paymentSaleId && <PaymentModal saleId={paymentSaleId} onClose={() => setPaymentSaleId(null)} onSaved={() => { setPaymentSaleId(null); notify('Payment recorded against the invoice.'); }} />}
  </>;
}

function SaleForm({ onClose, onSaved }: { onClose: () => void; onSaved: (saleId: string) => void }) {
  const { snapshot, service } = useLedger();
  const notify = useToast();
  const products = snapshot.products.filter((product) => !product.archived && product.quantity > 0);
  const [lines, setLines] = useState<Array<{ productId: string; quantity: number }>>(() => products[0] ? [{ productId: products[0].id, quantity: 1 }] : []);
  const [customerSelection, setCustomerSelection] = useState('');
  const [newCustomer, setNewCustomer] = useState<NewSaleCustomer>({ name: '', phone: '', email: '', address: '' });
  const [discountInput, setDiscountInput] = useState('0.00');
  const [paymentMode, setPaymentMode] = useState<'paid' | 'partial' | 'unpaid'>('paid');
  const [paidInput, setPaidInput] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isNewCustomer = customerSelection === newCustomerOption;
  const discountMinor = parseMoneyInput(discountInput);
  const selected = lines.map((line) => ({ line, product: products.find((product) => product.id === line.productId) })).filter((row): row is { line: { productId: string; quantity: number }; product: NonNullable<typeof row.product> } => Boolean(row.product));
  let totals: ReturnType<typeof calculateSaleTotals> | null = null;
  try {
    totals = selected.length ? calculateTotals(selected, discountMinor ?? 0, snapshot.settings.taxEnabled ? snapshot.settings.taxRateBps : 0) : null;
  } catch { totals = null; }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (discountMinor === null) { setError('Enter a discount with up to two decimal places.'); return; }
    if (!totals) { setError('Add a product and a valid quantity.'); return; }
    const paidMinor = paymentMode === 'paid' ? totals.totalMinor : paymentMode === 'unpaid' ? 0 : parseMoneyInput(paidInput);
    if (paidMinor === null) { setError('Enter a valid payment amount.'); return; }
    setSaving(true);
    try {
      const id = await service.recordSale({
        operationKey: crypto.randomUUID(), customerId: isNewCustomer ? null : customerSelection || null,
        ...(isNewCustomer ? { newCustomer } : {}),
        lines, discountMinor, taxRateBps: snapshot.settings.taxEnabled ? snapshot.settings.taxRateBps : 0, paidMinor, method,
      });
      onSaved(id);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not save this sale.';
      setError(message); notify(message, 'error');
    } finally { setSaving(false); }
  }

  return <Modal title="Record a sale" description="Add products and payment details. Stock will be checked before saving." onClose={onClose} wide>
    <form onSubmit={handleSubmit} className="form-layout">
      <label className="field full-field"><span>Customer <small>Optional for walk-in sales</small></span><select value={customerSelection} onChange={(event) => setCustomerSelection(event.target.value)}><option value="">Walk-in customer</option>{snapshot.customers.filter((customer) => !customer.archived).map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}<option value={newCustomerOption}>Add new customer</option></select></label>
      {isNewCustomer && <div className="form-layout full-field customer-checkout-fields">
        <label className="field"><span>Name</span><input required autoComplete="name" maxLength={140} value={newCustomer.name} onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="field"><span>Phone number</span><input required type="tel" autoComplete="tel" maxLength={40} value={newCustomer.phone} onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} /></label>
        <label className="field"><span>Email</span><input required type="email" autoComplete="email" maxLength={200} value={newCustomer.email} onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} /></label>
        <label className="field"><span>Address <small>Optional</small></span><textarea autoComplete="street-address" rows={2} maxLength={300} value={newCustomer.address ?? ''} onChange={(event) => setNewCustomer((current) => ({ ...current, address: event.target.value }))} /></label>
      </div>}
      <div className="line-entry full-field"><div className="line-entry-title"><span>Sale items</span><Button size="sm" variant="secondary" icon={Plus} disabled={products.length === 0} onClick={() => setLines((current) => [...current, { productId: products[0]?.id ?? '', quantity: 1 }])}>Add item</Button></div>
        {lines.map((line, index) => { const product = products.find((item) => item.id === line.productId); return <div className="sale-line" key={`${index}-${line.productId}`}><label className="field"><span className="sr-only">Product</span><select required value={line.productId} onChange={(event) => setLines((current) => current.map((item, row) => row === index ? { ...item, productId: event.target.value } : item))}><option value="" disabled>Select product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.quantity} {item.unit} available</option>)}</select></label><label className="field qty-field"><span className="sr-only">Quantity</span><input aria-label={`Quantity for ${product?.name ?? 'item'}`} type="number" min="1" max={product?.quantity ?? 999999} step="1" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, row) => row === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label><strong className="line-price">{formatMoney((product?.priceMinor ?? 0) * line.quantity)}</strong><button type="button" className="icon-button line-remove" aria-label="Remove item" disabled={lines.length <= 1} onClick={() => setLines((current) => current.filter((_, row) => row !== index))}><X size={16} /></button></div>; })}
        {products.length === 0 && <p className="muted">Add an active product with stock before recording a sale.</p>}
      </div>
      <label className="field"><span>Discount <small>INR</small></span><input inputMode="decimal" value={discountInput} onChange={(event) => setDiscountInput(event.target.value)} /></label>
      {snapshot.settings.taxEnabled ? <div className="field"><span>Tax rate</span><input value={`${(snapshot.settings.taxRateBps / 100).toFixed(2)}%`} readOnly /></div> : <div className="field"><span>Tax</span><input value="Not configured" readOnly /></div>}
      <div className="totals-box full-field"><div><span>Subtotal</span><strong>{formatMoney(totals?.subtotalMinor ?? 0)}</strong></div><div><span>Discount</span><strong>− {formatMoney(totals?.discountMinor ?? 0)}</strong></div>{snapshot.settings.taxEnabled && <div><span>Tax</span><strong>{formatMoney(totals?.taxMinor ?? 0)}</strong></div>}<div className="total-final"><span>Total due</span><strong>{formatMoney(totals?.totalMinor ?? 0)}</strong></div></div>
      <label className="field"><span>Payment status</span><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as typeof paymentMode)}><option value="paid">Paid in full</option><option value="partial">Part paid</option><option value="unpaid">Unpaid</option></select></label>
      <label className="field"><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{methods.map((item) => <option value={item} key={item}>{item.toUpperCase()}</option>)}</select></label>
      {paymentMode === 'partial' && <label className="field full-field"><span>Amount received <small>INR</small></span><input autoFocus inputMode="decimal" value={paidInput} onChange={(event) => setPaidInput(event.target.value)} placeholder="0.00" /></label>}
      <FormError message={error} />
      <FormActions onCancel={onClose} submitText={saving ? 'Saving…' : 'Save sale'} disabled={saving || products.length === 0} />
    </form>
  </Modal>;
}

function calculateTotals(rows: Array<{ line: { productId: string; quantity: number }; product: { priceMinor: number; costMinor: number } }>, discountMinor: number, taxRateBps: number) {
  return calculateSaleTotals(rows.map(({ line, product }) => ({ quantity: line.quantity, unitPriceMinor: product.priceMinor, unitCostMinor: product.costMinor })), discountMinor, taxRateBps);
}

function PaymentModal({ saleId, onClose, onSaved }: { saleId: string; onClose: () => void; onSaved: () => void }) {
  const { snapshot, service } = useLedger();
  const sale = snapshot.sales.find((row) => row.id === saleId);
  const paid = snapshot.payments.filter((payment) => payment.direction === 'in' && payment.saleId === saleId).reduce((sum, payment) => sum + payment.amountMinor, 0);
  const due = Math.max(0, (sale?.totalMinor ?? 0) - paid);
  const [amountInput, setAmountInput] = useState((due / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!sale) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseMoneyInput(amountInput);
    if (amountMinor === null) { setError('Enter a valid payment amount.'); return; }
    setSaving(true);
    try { await service.recordSalePayment({ saleId, amountMinor, method, note: '', operationKey: crypto.randomUUID() }); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record payment.'); }
    finally { setSaving(false); }
  }
  return <Modal title="Record customer payment" description={`${sale.invoiceNo} · balance ${formatMoney(due)}`} onClose={onClose}><form onSubmit={submit} className="form-layout one-column"><label className="field"><span>Amount received <small>INR</small></span><input inputMode="decimal" autoFocus value={amountInput} onChange={(event) => setAmountInput(event.target.value)} /></label><label className="field"><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{methods.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label><FormError message={error} /><FormActions onCancel={onClose} submitText={saving ? 'Saving…' : 'Record payment'} disabled={saving} /></form></Modal>;
}

function ReceiptModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { snapshot } = useLedger();
  const sale = snapshot.sales.find((row) => row.id === saleId);
  if (!sale) return null;
  const items = snapshot.saleItems.filter((item) => item.saleId === sale.id);
  const payments = snapshot.payments.filter((payment) => payment.saleId === sale.id && payment.direction === 'in');
  const paid = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  return <Modal title="Receipt preview" description={`${sale.invoiceNo} · ${formatDate(sale.createdAt)}`} onClose={onClose} wide>
    <div className="receipt-toolbar"><Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print receipt</Button><Button variant="quiet" icon={ArrowDownToLine} onClick={() => window.print()}>Save as PDF</Button></div>
    <article className="receipt-document print-document"><div className="receipt-brand"><div className="brand-mark">L</div><div><strong>{snapshot.settings.businessName}</strong><small>{snapshot.settings.address || 'Local retail business'}</small>{snapshot.settings.phone && <small>{snapshot.settings.phone}</small>}</div></div><div className="receipt-meta"><div><small>INVOICE</small><strong>{sale.invoiceNo}</strong></div><div><small>DATE</small><strong>{formatDate(sale.createdAt)} · {formatTime(sale.createdAt)}</strong></div><div><small>CUSTOMER</small><strong>{sale.customerName}</strong>{sale.customerPhone && <small>{sale.customerPhone}</small>}{sale.customerEmail && <small>{sale.customerEmail}</small>}{sale.customerAddress && <small>{sale.customerAddress}</small>}</div></div><div className="table-scroll"><table><thead><tr><th>Item</th><th>Qty</th><th className="align-right">Price</th><th className="align-right">Amount</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.productName}<small className="table-subline">{item.sku}</small></td><td>{item.quantity}</td><td className="align-right">{formatMoney(item.unitPriceMinor)}</td><td className="align-right">{formatMoney(item.lineSubtotalMinor)}</td></tr>)}</tbody></table></div><div className="receipt-totals"><div><span>Subtotal</span><strong>{formatMoney(sale.subtotalMinor)}</strong></div>{sale.discountMinor > 0 && <div><span>Discount</span><strong>− {formatMoney(sale.discountMinor)}</strong></div>}{sale.taxMinor > 0 && <div><span>Tax</span><strong>{formatMoney(sale.taxMinor)}</strong></div>}<div className="receipt-total"><span>Total</span><strong>{formatMoney(sale.totalMinor)}</strong></div><div><span>Paid</span><strong>{formatMoney(paid)}</strong></div><div><span>Balance</span><strong>{formatMoney(Math.max(0, sale.totalMinor - paid))}</strong></div></div><p className="receipt-thanks">Thank you for shopping with us.</p></article>
  </Modal>;
}

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, Minus, Plus, Printer, ReceiptText, Search, Trash2, X } from 'lucide-react';
import { useLedger } from '../../app/ledger-context';
import { useToast } from '../../components/toast';
import { Button, EmptyState, Field, FormActions, FormError, Modal, PageHeading, Panel, StatusBadge, TextAreaInput, TextInput } from '../../components/ui';
import { calculateSaleTotals, saleStatus } from '../../domain/calculations';
import type { NewSaleCustomer, PaymentMethod, Product } from '../../domain/models';
import { formatMoney, parseMoneyInput } from '../../domain/money';
import { formatDate, formatTime } from '../../shared/format';

const methods: PaymentMethod[] = ['cash', 'upi', 'card', 'bank', 'other'];
const newCustomerOption = '__add_customer__';
type CartLine = { productId: string; quantity: number };

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
    {showSale ? <>
      <PageHeading eyebrow="POINT OF SALE" title="Quick sale" description="Find items, add them to the cart, and complete checkout." actions={<Button variant="secondary" icon={X} onClick={() => setShowSale(false)}>Back to sales</Button>} />
      <SaleForm onClose={() => setShowSale(false)} onSaved={(id) => { setShowSale(false); setReceiptId(id); notify('Sale recorded. Stock and payment records were updated.'); }} />
    </> : <>
      <PageHeading eyebrow="CHECKOUT & RECEIPTS" title="Sales & billing" description="Record checkouts, track payment status, and find invoices." actions={<Button icon={Plus} onClick={() => setShowSale(true)}>New sale</Button>} />
      <div className="mini-stats"><div><span>Sales recorded</span><strong>{formatMoney(total)}</strong></div><div><span>Invoices</span><strong>{snapshot.sales.length}</strong></div><div><span>Customer balances</span><strong>{formatMoney(outstanding)}</strong></div></div>
      <Panel className="table-panel"><div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search invoice or customer" /><label className="select-label"><span className="sr-only">Filter payment status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All payment statuses</option><option value="paid">Paid</option><option value="partial">Part paid</option><option value="unpaid">Unpaid</option></select></label></div>
        {rows.length === 0 ? <EmptyState title={snapshot.sales.length ? 'No matching sales' : 'No sales recorded yet'} description={snapshot.sales.length ? 'Try a different search or payment filter.' : 'Record a checkout to create your first invoice and update stock.'} action={!snapshot.sales.length && <Button icon={Plus} onClick={() => setShowSale(true)}>Record a sale</Button>} /> : <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Items</th><th className="align-right">Total</th><th>Payment</th><th className="align-right">Actions</th></tr></thead><tbody>{rows.map((sale) => {
          const status = saleStatus(sale, snapshot.payments);
          const saleItems = snapshot.saleItems.filter((item) => item.saleId === sale.id);
          const paid = snapshot.payments.filter((payment) => payment.direction === 'in' && payment.saleId === sale.id).reduce((sum, payment) => sum + payment.amountMinor, 0);
          return <tr key={sale.id}><td><strong className="table-primary">{sale.invoiceNo}</strong></td><td>{sale.customerName}</td><td><span>{formatDate(sale.createdAt)}</span><small className="table-subline">{formatTime(sale.createdAt)}</small></td><td>{saleItems.reduce((sum, item) => sum + item.quantity, 0)} units</td><td className="align-right"><strong>{formatMoney(sale.totalMinor)}</strong></td><td><StatusBadge tone={status === 'paid' ? 'success' : status === 'partial' ? 'info' : 'warning'}>{status === 'paid' ? 'Paid' : status === 'partial' ? `${formatMoney(paid)} paid` : 'Unpaid'}</StatusBadge></td><td className="align-right row-actions"><Button variant="quiet" size="sm" icon={ReceiptText} onClick={() => setReceiptId(sale.id)}>Receipt</Button>{status !== 'paid' && <Button variant="secondary" size="sm" onClick={() => setPaymentSaleId(sale.id)}>Payment</Button>}</td></tr>;
        })}</tbody></table></div>}
      </Panel>
    </>}
    {receiptId && <ReceiptModal saleId={receiptId} onClose={() => setReceiptId(null)} onNewSale={() => { setReceiptId(null); setShowSale(true); }} />}
    {paymentSaleId && <PaymentModal saleId={paymentSaleId} onClose={() => setPaymentSaleId(null)} onSaved={() => { setPaymentSaleId(null); notify('Payment recorded against the invoice.'); }} />}
  </>;
}

function SaleForm({ onClose, onSaved }: { onClose: () => void; onSaved: (saleId: string) => void }) {
  const { snapshot, service } = useLedger();
  const notify = useToast();
  const products = snapshot.products.filter((product) => !product.archived && product.quantity > 0);
  const categories = [...new Set(products.map((product) => product.categoryName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [lines, setLines] = useState<CartLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [customerSelection, setCustomerSelection] = useState('');
  const [newCustomer, setNewCustomer] = useState<NewSaleCustomer>({ name: '', phone: '', email: '', address: '' });
  const [discountInput, setDiscountInput] = useState('0.00');
  const [paymentMode, setPaymentMode] = useState<'paid' | 'partial' | 'unpaid'>('paid');
  const [paidInput, setPaidInput] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const discountMinor = parseMoneyInput(discountInput);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku}`.toLowerCase().includes(productSearch.toLowerCase());
    return matchesSearch && (category === 'all' || product.categoryName === category);
  }), [products, productSearch, category]);
  const selected = lines.map((line) => ({ line, product: products.find((product) => product.id === line.productId) }))
    .filter((row): row is { line: CartLine; product: Product } => Boolean(row.product));
  let totals: ReturnType<typeof calculateSaleTotals> | null = null;
  try {
    totals = selected.length ? calculateTotals(selected, discountMinor ?? 0, snapshot.settings.taxEnabled ? snapshot.settings.taxRateBps : 0) : null;
  } catch { totals = null; }
  const customerIsNew = customerSelection === newCustomerOption;

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !saving) {
        event.preventDefault();
          formRef.current?.requestSubmit();
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [saving]);

  function addProduct(product: Product) {
    setLines((current) => {
      const row = current.find((line) => line.productId === product.id);
      if (!row) return [...current, { productId: product.id, quantity: 1 }];
      if (row.quantity >= product.quantity) return current;
      return current.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line);
    });
  }

  function setQuantity(productId: string, quantity: number) {
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    setLines((current) => current.map((line) => line.productId === productId ? { ...line, quantity: Math.min(product.quantity, Math.max(1, quantity)) } : line));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (discountMinor === null) { setError('Enter a discount with up to two decimal places.'); return; }
    if (!totals || !lines.length) { setError('Add at least one product to the cart.'); return; }
    const paidMinor = paymentMode === 'paid' ? totals.totalMinor : paymentMode === 'unpaid' ? 0 : parseMoneyInput(paidInput);
    if (paidMinor === null) { setError('Enter a valid payment amount.'); return; }
    setSaving(true);
    try {
      const id = await service.recordSale({
        operationKey: crypto.randomUUID(), customerId: customerIsNew ? null : customerSelection || null,
        ...(customerIsNew ? { newCustomer } : {}), lines, discountMinor,
        taxRateBps: snapshot.settings.taxEnabled ? snapshot.settings.taxRateBps : 0, paidMinor, method,
      });
      onSaved(id);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not save this sale.';
      setError(message); notify(message, 'error');
    } finally { setSaving(false); }
  }

  return <div className="pos-layout">
    <section className="pos-catalog panel" aria-label="Product catalog">
      <div className="pos-catalog-header"><div><h2>Add items</h2><p>{products.length} products available</p></div><div className="pos-filter-row"><label className="search-input pos-product-search"><Search size={16} /><span className="sr-only">Search products</span><input ref={searchRef} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search product or SKU" /><kbd>/</kbd></label><label className="sr-only" htmlFor="pos-category">Filter products by category</label><select id="pos-category" className="compact-select" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></div></div>
      {visibleProducts.length ? <div className="product-picker-grid">{visibleProducts.map((product) => {
        const quantityInCart = lines.find((line) => line.productId === product.id)?.quantity ?? 0;
        return <button type="button" className="product-picker-card" key={product.id} onClick={() => addProduct(product)} disabled={quantityInCart >= product.quantity} aria-label={`Add ${product.name} to sale`}><span className="product-picker-top"><span className="product-picker-icon">{product.name.slice(0, 1).toUpperCase()}</span>{quantityInCart > 0 && <StatusBadge tone="info">{quantityInCart} in cart</StatusBadge>}</span><strong>{product.name}</strong><small>{product.sku || product.categoryName || 'Product'}</small><span className={`product-availability ${product.quantity <= product.reorderPoint ? 'product-availability-low' : ''}`}>{product.quantity} {product.unit} available</span><span className="product-picker-bottom"><strong>{formatMoney(product.priceMinor)}</strong><span><Plus size={15} /> Add</span></span></button>;
      })}</div> : <EmptyState title={products.length ? 'No matching products' : 'No products in stock'} description={products.length ? 'Try another product name, SKU, or category.' : 'Add stock from Inventory or receive a purchase to start a sale.'} />}
    </section>

    <form ref={formRef} onSubmit={handleSubmit} className="pos-cart panel" aria-label="Sale cart">
      <div className="pos-cart-heading"><div><h2>Current sale</h2><p>{lines.reduce((sum, line) => sum + line.quantity, 0)} item{lines.reduce((sum, line) => sum + line.quantity, 0) === 1 ? '' : 's'}</p></div><Button variant="quiet" size="sm" onClick={onClose}>Cancel</Button></div>
      <div className="pos-customer-section"><Field label="Customer" hint="Optional for walk-in sales"><select value={customerSelection} onChange={(event) => setCustomerSelection(event.target.value)}><option value="">Walk-in customer</option>{snapshot.customers.filter((customer) => !customer.archived).map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}<option value={newCustomerOption}>+ Add new customer</option></select></Field>
        {customerIsNew && <div className="pos-customer-fields"><Field label="Name"><TextInput required autoComplete="name" maxLength={140} value={newCustomer.name} onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Phone number"><TextInput required type="tel" autoComplete="tel" maxLength={40} value={newCustomer.phone} onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} /></Field><Field label="Email"><TextInput required type="email" autoComplete="email" maxLength={200} value={newCustomer.email} onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} /></Field><Field label="Address" hint="Optional"><TextAreaInput autoComplete="street-address" rows={2} maxLength={300} value={newCustomer.address ?? ''} onChange={(event) => setNewCustomer((current) => ({ ...current, address: event.target.value }))} /></Field></div>}
      </div>
      <div className="cart-lines" aria-live="polite">{selected.length ? selected.map(({ line, product }) => <div className="cart-line" key={line.productId}><div className="cart-line-info"><strong>{product.name}</strong><small>{formatMoney(product.priceMinor)} each · {product.quantity} in stock</small></div><div className="cart-quantity"><button type="button" aria-label={`Decrease ${product.name} quantity`} disabled={line.quantity <= 1} onClick={() => setQuantity(product.id, line.quantity - 1)}><Minus size={13} /></button><input aria-label={`Quantity for ${product.name}`} type="number" min="1" max={product.quantity} step="1" value={line.quantity} onChange={(event) => setQuantity(product.id, Number(event.target.value))} /><button type="button" aria-label={`Increase ${product.name} quantity`} disabled={line.quantity >= product.quantity} onClick={() => setQuantity(product.id, line.quantity + 1)}><Plus size={13} /></button></div><strong className="cart-line-total">{formatMoney(product.priceMinor * line.quantity)}</strong><button type="button" className="icon-button cart-remove" aria-label={`Remove ${product.name}`} onClick={() => setLines((current) => current.filter((item) => item.productId !== product.id))}><Trash2 size={15} /></button></div>) : <div className="cart-empty"><ReceiptText size={21} /><strong>Your cart is empty</strong><p>Choose products from the catalog to build this sale.</p></div>}</div>
      <div className="pos-checkout-fields"><Field label="Discount" hint="INR"><TextInput inputMode="decimal" value={discountInput} onChange={(event) => setDiscountInput(event.target.value)} /></Field><Field label="Payment status"><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as typeof paymentMode)}><option value="paid">Paid in full</option><option value="partial">Part paid</option><option value="unpaid">Unpaid</option></select></Field>
        {snapshot.settings.taxEnabled ? <div className="tax-summary-field"><span>Tax rate</span><strong>{(snapshot.settings.taxRateBps / 100).toFixed(2)}%</strong></div> : <div className="tax-summary-field"><span>Tax</span><strong>Not configured</strong></div>}
        <Field label="Payment method"><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{methods.map((item) => <option value={item} key={item}>{item.toUpperCase()}</option>)}</select></Field>
        {paymentMode === 'partial' && <Field label="Amount received" hint="INR" className="partial-payment-field"><TextInput autoFocus inputMode="decimal" value={paidInput} onChange={(event) => setPaidInput(event.target.value)} placeholder="0.00" /></Field>}
      </div>
      <div className="pos-totals"><div><span>Subtotal</span><strong>{formatMoney(totals?.subtotalMinor ?? 0)}</strong></div><div><span>Discount</span><strong>− {formatMoney(totals?.discountMinor ?? 0)}</strong></div>{snapshot.settings.taxEnabled && <div><span>Tax</span><strong>{formatMoney(totals?.taxMinor ?? 0)}</strong></div>}<div className="pos-total-final"><span>Total due</span><strong>{formatMoney(totals?.totalMinor ?? 0)}</strong></div></div>
      <FormError message={error} />
      <Button type="submit" className="pos-submit" disabled={saving || !lines.length || products.length === 0}><ReceiptText size={17} />{saving ? 'Completing sale…' : `Complete sale · ${formatMoney(totals?.totalMinor ?? 0)}`}<kbd>Ctrl ↵</kbd></Button>
      <p className="pos-integrity-note">Stock is checked again before saving. Sale, payment, and stock history are recorded together.</p>
    </form>
  </div>;
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search-input"><span className="sr-only">Search sales</span><Search size={15} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function calculateTotals(rows: Array<{ line: CartLine; product: Product }>, discountMinor: number, taxRateBps: number) {
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
  return <Modal title="Record customer payment" description={`${sale.invoiceNo} · balance ${formatMoney(due)}`} onClose={onClose}><form onSubmit={submit} className="form-layout one-column"><Field label="Amount received" hint="INR"><TextInput inputMode="decimal" autoFocus value={amountInput} onChange={(event) => setAmountInput(event.target.value)} /></Field><Field label="Payment method"><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{methods.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></Field><FormError message={error} /><FormActions onCancel={onClose} submitText={saving ? 'Saving…' : 'Record payment'} disabled={saving} /></form></Modal>;
}

function ReceiptModal({ saleId, onClose, onNewSale }: { saleId: string; onClose: () => void; onNewSale: () => void }) {
  const { snapshot } = useLedger();
  const sale = snapshot.sales.find((row) => row.id === saleId);
  if (!sale) return null;
  const items = snapshot.saleItems.filter((item) => item.saleId === sale.id);
  const payments = snapshot.payments.filter((payment) => payment.saleId === sale.id && payment.direction === 'in');
  const paid = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  return <Modal title="Sale complete" description={`${sale.invoiceNo} · ${formatDate(sale.createdAt)}`} onClose={onClose} wide>
    <div className="receipt-success"><span><ReceiptText size={19} /></span><div><strong>Sale recorded successfully</strong><small>Inventory and payment records were updated.</small></div></div>
    <div className="receipt-toolbar"><Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print receipt</Button><Button variant="secondary" icon={ArrowDownToLine} onClick={() => window.print()}>Save as PDF</Button><Button onClick={onNewSale}><Plus size={16} />Start another sale</Button></div>
    <article className="receipt-document print-document"><div className="receipt-brand"><div className="brand-mark">L</div><div><strong>{snapshot.settings.businessName}</strong><small>{snapshot.settings.address || 'Local retail business'}</small>{snapshot.settings.phone && <small>{snapshot.settings.phone}</small>}</div></div><div className="receipt-meta"><div><small>INVOICE</small><strong>{sale.invoiceNo}</strong></div><div><small>DATE</small><strong>{formatDate(sale.createdAt)} · {formatTime(sale.createdAt)}</strong></div><div><small>CUSTOMER</small><strong>{sale.customerName}</strong>{sale.customerPhone && <small>{sale.customerPhone}</small>}{sale.customerEmail && <small>{sale.customerEmail}</small>}{sale.customerAddress && <small>{sale.customerAddress}</small>}</div></div><div className="table-scroll"><table><thead><tr><th>Item</th><th>Qty</th><th className="align-right">Price</th><th className="align-right">Amount</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.productName}<small className="table-subline">{item.sku}</small></td><td>{item.quantity}</td><td className="align-right">{formatMoney(item.unitPriceMinor)}</td><td className="align-right">{formatMoney(item.lineSubtotalMinor)}</td></tr>)}</tbody></table></div><div className="receipt-totals"><div><span>Subtotal</span><strong>{formatMoney(sale.subtotalMinor)}</strong></div>{sale.discountMinor > 0 && <div><span>Discount</span><strong>− {formatMoney(sale.discountMinor)}</strong></div>}{sale.taxMinor > 0 && <div><span>Tax</span><strong>{formatMoney(sale.taxMinor)}</strong></div>}<div className="receipt-total"><span>Total</span><strong>{formatMoney(sale.totalMinor)}</strong></div><div><span>Paid</span><strong>{formatMoney(paid)}</strong></div><div><span>Balance</span><strong>{formatMoney(Math.max(0, sale.totalMinor - paid))}</strong></div></div><p className="receipt-thanks">Thank you for shopping with us.</p></article>
  </Modal>;
}

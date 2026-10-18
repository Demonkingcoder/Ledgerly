import { useMemo, useState, type FormEvent } from 'react';
import { Check, Plus, Truck, X } from 'lucide-react';
import { useLedger } from '../../app/ledger-context';
import { useToast } from '../../components/toast';
import { Button, ConfirmDialog, EmptyState, FormActions, FormError, Modal, PageHeading, Panel, SearchInput, StatusBadge } from '../../components/ui';
import { purchaseBalance } from '../../domain/calculations';
import type { PaymentMethod, Purchase } from '../../domain/models';
import { formatMoney, parseMoneyInput } from '../../domain/money';
import { formatDate } from '../../shared/format';

type PurchaseDraftLine = { productId: string; quantity: number; unitCost: string };

export function PurchasesPage() {
  const { snapshot, service } = useLedger();
  const notify = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState<Purchase | null>(null);
  const [confirmation, setConfirmation] = useState<{ purchase: Purchase; action: 'receive' | 'cancel' } | null>(null);
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => snapshot.purchases.filter((purchase) => `${purchase.reference} ${purchase.supplierName}`.toLowerCase().includes(search.toLowerCase()) && (statusFilter === 'all' || purchase.status === statusFilter)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [snapshot.purchases, search, statusFilter]);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const receivedTotal = snapshot.purchases.filter((purchase) => purchase.status === 'received').reduce((sum, purchase) => sum + purchase.subtotalMinor, 0);
  const receivedMonth = snapshot.purchases.filter((purchase) => purchase.status === 'received' && new Date(purchase.receivedAt ?? purchase.createdAt) >= monthStart).reduce((sum, purchase) => sum + purchase.subtotalMinor, 0);
  const payable = snapshot.purchases.filter((purchase) => purchase.status === 'received').reduce((sum, purchase) => sum + Math.max(0, purchase.subtotalMinor - snapshot.payments.filter((payment) => payment.direction === 'out' && payment.purchaseId === purchase.id).reduce((paid, payment) => paid + payment.amountMinor, 0)), 0);

  async function receive(purchase: Purchase) {
    setPendingActions((current) => new Set(current).add(purchase.id));
    try { await service.receivePurchase(purchase.id); notify(`${purchase.reference} received and stock updated.`); setConfirmation(null); }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not receive purchase.', 'error'); }
    finally { setPendingActions((current) => { const next = new Set(current); next.delete(purchase.id); return next; }); }
  }
  async function cancel(purchase: Purchase) {
    setPendingActions((current) => new Set(current).add(purchase.id));
    try { await service.cancelPurchase(purchase.id); notify(`${purchase.reference} cancelled.`); setConfirmation(null); }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not cancel purchase.', 'error'); }
    finally { setPendingActions((current) => { const next = new Set(current); next.delete(purchase.id); return next; }); }
  }

  return <>
    <PageHeading eyebrow="SUPPLIES & PAYABLES" title="Purchases" description="Track orders, receive stock once, and keep supplier payments clear." actions={<Button icon={Plus} onClick={() => setShowNew(true)}>New purchase</Button>} />
    <div className="mini-stats"><div><span>Purchases this month</span><strong>{formatMoney(receivedMonth)}</strong></div><div><span>Received purchases</span><strong>{snapshot.purchases.filter((purchase) => purchase.status === 'received').length}</strong></div><div><span>Supplier payables</span><strong>{formatMoney(payable)}</strong></div><div><span>All received purchases</span><strong>{formatMoney(receivedTotal)}</strong></div></div>
    <Panel className="table-panel"><div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search reference or supplier" /><label className="select-label"><span className="sr-only">Filter purchase status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select></label></div>
      {rows.length === 0 ? <EmptyState title={snapshot.purchases.length ? 'No matching purchases' : 'No purchases yet'} description={snapshot.purchases.length ? 'Try another search or filter.' : 'Create a purchase draft, then receive it when goods arrive.'} action={!snapshot.purchases.length && <Button icon={Plus} onClick={() => setShowNew(true)}>Create purchase</Button>} /> : <div className="table-scroll"><table><thead><tr><th>Reference</th><th>Supplier</th><th>Date</th><th>Items</th><th className="align-right">Total</th><th className="align-right">Paid</th><th className="align-right">Outstanding</th><th>Status</th><th className="align-right">Actions</th></tr></thead><tbody>{rows.map((purchase) => {
        const items = snapshot.purchaseItems.filter((item) => item.purchaseId === purchase.id);
        const paid = snapshot.payments.filter((payment) => payment.direction === 'out' && payment.purchaseId === purchase.id).reduce((sum, payment) => sum + payment.amountMinor, 0);
        const outstandingAmount = purchase.status === 'received' ? purchaseBalance(purchase, snapshot.payments) : 0;
        const pending = pendingActions.has(purchase.id);
        return <tr key={purchase.id}><td><button className="table-link" onClick={() => setDetail(purchase)}>{purchase.reference}</button></td><td>{purchase.supplierName}</td><td>{formatDate(purchase.receivedAt ?? purchase.createdAt)}</td><td>{items.reduce((sum, item) => sum + item.quantity, 0)} units</td><td className="align-right">{formatMoney(purchase.subtotalMinor)}</td><td className="align-right">{formatMoney(paid)}</td><td className="align-right">{purchase.status === 'received' ? formatMoney(outstandingAmount) : '—'}</td><td><StatusBadge tone={purchase.status === 'received' ? 'success' : purchase.status === 'cancelled' ? 'neutral' : 'warning'}>{purchase.status[0].toUpperCase() + purchase.status.slice(1)}</StatusBadge></td><td className="align-right row-actions">{purchase.status === 'draft' && <><Button size="sm" icon={Check} disabled={pending} onClick={() => setConfirmation({ purchase, action: 'receive' })}>Receive</Button><Button size="sm" variant="quiet" icon={X} disabled={pending} onClick={() => setConfirmation({ purchase, action: 'cancel' })}>Cancel</Button></>}</td></tr>;
      })}</tbody></table></div>}
    </Panel>
    <Panel className="info-panel"><Truck size={17} /><p><strong>Stock changes when a purchase is received.</strong> Draft and cancelled purchases stay in history but do not change on-hand quantities. Receiving the same purchase twice is safely ignored.</p></Panel>
    {confirmation && <ConfirmDialog title={confirmation.action === 'receive' ? `Receive ${confirmation.purchase.reference}?` : `Cancel draft ${confirmation.purchase.reference}?`} description={confirmation.action === 'receive' ? 'The listed quantities will be added to inventory once.' : 'Inventory will not change when this draft is cancelled.'} onClose={() => setConfirmation(null)} onConfirm={() => confirmation.action === 'receive' ? receive(confirmation.purchase) : cancel(confirmation.purchase)} confirmLabel={confirmation.action === 'receive' ? 'Receive purchase' : 'Cancel draft'} workingLabel={confirmation.action === 'receive' ? 'Receiving…' : 'Cancelling…'} busy={pendingActions.has(confirmation.purchase.id)} danger={confirmation.action === 'cancel'} />}
    {showNew && <PurchaseForm onClose={() => setShowNew(false)} onSaved={(status) => { setShowNew(false); notify(status === 'received' ? 'Purchase received and stock updated.' : 'Purchase draft saved.'); }} />}
    {detail && <PurchaseDetail purchase={detail} onClose={() => setDetail(null)} />}
  </>;
}

function PurchaseForm({ onClose, onSaved }: { onClose: () => void; onSaved: (status: 'draft' | 'received') => void }) {
  const { snapshot, service } = useLedger();
  const notify = useToast();
  const suppliers = snapshot.suppliers.filter((supplier) => !supplier.archived);
  const products = snapshot.products.filter((product) => !product.archived);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [lines, setLines] = useState<PurchaseDraftLine[]>(() => products[0] ? [{ productId: products[0].id, quantity: 1, unitCost: (products[0].costMinor / 100).toFixed(2) }] : []);
  const [status, setStatus] = useState<'draft' | 'received'>('draft');
  const [paidInput, setPaidInput] = useState('0.00');
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const totalMinor = lines.reduce((sum, line) => sum + (parseMoneyInput(line.unitCost) ?? 0) * (Number.isSafeInteger(line.quantity) ? line.quantity : 0), 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId) { setError('Add a supplier before creating a purchase.'); return; }
    if (lines.some((line) => !line.productId || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || parseMoneyInput(line.unitCost) === null)) { setError('Check each product, quantity, and unit cost.'); return; }
    const paidMinor = status === 'draft' ? 0 : parseMoneyInput(paidInput);
    if (paidMinor === null || paidMinor > totalMinor) { setError('Enter a valid payment up to the purchase total.'); return; }
    setSaving(true);
    try {
      await service.createPurchase({ supplierId, lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCostMinor: parseMoneyInput(line.unitCost) ?? 0 })), notes, status, paidMinor, method, operationKey: crypto.randomUUID() });
      onSaved(status);
    } catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not save purchase.'; setError(message); notify(message, 'error'); }
    finally { setSaving(false); }
  }

  return <Modal title="New purchase" description="Add supplier items. Choose Received only after the goods arrive." onClose={onClose} wide><form className="form-layout" onSubmit={submit}>
    <label className="field"><span>Supplier</span><select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
    <label className="field"><span>Purchase status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="draft">Draft</option><option value="received">Received now</option></select></label>
    <div className="line-entry full-field"><div className="line-entry-title"><span>Items</span><Button size="sm" variant="secondary" icon={Plus} disabled={!products.length} onClick={() => { const product = products[0]; if (product) setLines((current) => [...current, { productId: product.id, quantity: 1, unitCost: (product.costMinor / 100).toFixed(2) }]); }}>Add item</Button></div>
      {lines.map((line, index) => <div className="purchase-line" key={`${line.productId}-${index}`}><label className="field"><span className="sr-only">Product</span><select value={line.productId} onChange={(event) => { const product = products.find((row) => row.id === event.target.value); setLines((current) => current.map((row, i) => i === index ? { ...row, productId: event.target.value, unitCost: product ? (product.costMinor / 100).toFixed(2) : row.unitCost } : row)); }}><option value="">Select product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name} · current {product.quantity}</option>)}</select></label><label className="field qty-field"><span className="sr-only">Quantity</span><input aria-label="Purchase quantity" type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLines((current) => current.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) } : row))} /></label><label className="field cost-input"><span className="sr-only">Unit cost</span><input aria-label="Unit cost in INR" inputMode="decimal" value={line.unitCost} onChange={(event) => setLines((current) => current.map((row, i) => i === index ? { ...row, unitCost: event.target.value } : row))} /></label><strong className="line-price">{formatMoney((parseMoneyInput(line.unitCost) ?? 0) * line.quantity)}</strong><button className="icon-button line-remove" type="button" aria-label="Remove item" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>×</button></div>)}
    </div>
    {status === 'received' && <><label className="field"><span>Paid now <small>INR</small></span><input inputMode="decimal" value={paidInput} onChange={(event) => setPaidInput(event.target.value)} /></label><label className="field"><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{['cash', 'upi', 'card', 'bank', 'other'].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label></>}
    <label className="field full-field"><span>Notes <small>Optional</small></span><input maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Order reference or delivery notes" /></label>
    <div className="totals-box full-field"><div className="total-final"><span>Purchase total</span><strong>{formatMoney(totalMinor)}</strong></div>{status === 'received' && <small>Outstanding after payment: {formatMoney(Math.max(0, totalMinor - (parseMoneyInput(paidInput) ?? 0)))}</small>}</div>
    <FormError message={error} /><FormActions onCancel={onClose} submitText={saving ? 'Saving…' : status === 'received' ? 'Receive purchase' : 'Save draft'} disabled={saving || !products.length || !suppliers.length} />
  </form></Modal>;
}

function PurchaseDetail({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const { snapshot } = useLedger();
  const items = snapshot.purchaseItems.filter((item) => item.purchaseId === purchase.id);
  const paid = snapshot.payments.filter((payment) => payment.direction === 'out' && payment.purchaseId === purchase.id).reduce((sum, payment) => sum + payment.amountMinor, 0);
  const outstanding = purchase.status === 'received' ? purchaseBalance(purchase, snapshot.payments) : 0;
  return <Modal title={purchase.reference} description={`${purchase.supplierName} · ${formatDate(purchase.receivedAt ?? purchase.createdAt)}`} onClose={onClose} wide><div className="table-scroll"><table><thead><tr><th>Product</th><th>Quantity</th><th className="align-right">Unit cost</th><th className="align-right">Line total</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.productName}</td><td>{item.quantity}</td><td className="align-right">{formatMoney(item.unitCostMinor)}</td><td className="align-right">{formatMoney(item.lineTotalMinor)}</td></tr>)}</tbody></table></div><div className="receipt-totals"><div className="receipt-total"><span>Purchase total</span><strong>{formatMoney(purchase.subtotalMinor)}</strong></div><div><span>Status</span><StatusBadge tone={purchase.status === 'received' ? 'success' : purchase.status === 'cancelled' ? 'neutral' : 'warning'}>{purchase.status}</StatusBadge></div>{purchase.status === 'received' && <><div><span>Paid</span><strong>{formatMoney(paid)}</strong></div><div><span>Outstanding</span><strong>{formatMoney(outstanding)}</strong></div></>}{purchase.notes && <p>{purchase.notes}</p>}</div></Modal>;
}

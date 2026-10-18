import { useMemo, useState, type FormEvent } from 'react';
import { Archive, Boxes, Pencil, Plus, Wallet } from 'lucide-react';
import { useLedger } from '../../app/ledger-context';
import { useToast } from '../../components/toast';
import { Button, ConfirmDialog, EmptyState, FormActions, FormError, Modal, PageHeading, Panel, SearchInput, StatusBadge } from '../../components/ui';
import { supplierBalances } from '../../domain/calculations';
import type { PaymentMethod, Supplier } from '../../domain/models';
import { formatMoney, parseMoneyInput } from '../../domain/money';
import { formatDate } from '../../shared/format';

type SupplierDraft = { name: string; phone: string; email: string; notes: string };
const blankSupplier: SupplierDraft = { name: '', phone: '', email: '', notes: '' };

export function SuppliersPage() {
  const { snapshot, service } = useLedger();
  const notify = useToast();
  const balances = supplierBalances(snapshot);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [pay, setPay] = useState<Supplier | null>(null);
  const [history, setHistory] = useState<Supplier | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Supplier | null>(null);
  const rows = useMemo(() => snapshot.suppliers.filter((supplier) => (includeArchived || !supplier.archived) && `${supplier.name} ${supplier.phone} ${supplier.email} ${supplier.notes}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [snapshot.suppliers, includeArchived, search]);
  const dueTotal = balances.reduce((sum, row) => sum + row.balanceMinor, 0);

  async function archive(supplier: Supplier) {
    try { await service.archiveSupplier(supplier.id); notify(`${supplier.name} archived.`); setArchiveTarget(null); }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not archive supplier.', 'error'); }
  }

  return <>
    <PageHeading eyebrow="SUPPLIER ACCOUNTS" title="Suppliers" description="Track purchase history, payments, and the amount you still owe." actions={<Button icon={Plus} onClick={() => setShowForm(true)}>Add supplier</Button>} />
    <div className="mini-stats"><div><span>Active suppliers</span><strong>{snapshot.suppliers.filter((supplier) => !supplier.archived).length}</strong></div><div><span>Outstanding payables</span><strong>{formatMoney(dueTotal)}</strong></div><div><span>Received purchases</span><strong>{snapshot.purchases.filter((purchase) => purchase.status === 'received').length}</strong></div></div>
    <Panel className="table-panel"><div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search supplier or contact" /><label className="check-filter"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />Include archived</label></div>
      {rows.length === 0 ? <EmptyState title={snapshot.suppliers.length ? 'No matching suppliers' : 'Add your first supplier'} description="Supplier balances come from received purchases and recorded payments." action={!snapshot.suppliers.length && <Button icon={Plus} onClick={() => setShowForm(true)}>Add supplier</Button>} /> : <div className="table-scroll"><table><thead><tr><th>Supplier</th><th>Contact</th><th>Received purchases</th><th>Purchase value</th><th>Paid</th><th>Outstanding</th><th>Status</th><th className="align-right">Actions</th></tr></thead><tbody>{rows.map((supplier) => {
        const balance = balances.find((row) => row.partyId === supplier.id);
        const purchases = snapshot.purchases.filter((purchase) => purchase.supplierId === supplier.id && purchase.status === 'received');
        const paid = snapshot.payments.filter((payment) => payment.partyType === 'supplier' && payment.partyId === supplier.id && payment.direction === 'out').reduce((sum, payment) => sum + payment.amountMinor, 0);
        return <tr key={supplier.id}><td><div className="product-cell"><span className="supplier-icon"><Boxes size={16} /></span><div><strong className="table-primary">{supplier.name}</strong><small className="table-subline">{supplier.notes || 'Supplier'}</small></div></div></td><td><span>{supplier.phone || '—'}</span><small className="table-subline">{supplier.email}</small></td><td>{purchases.length}</td><td>{formatMoney(balance?.totalMinor ?? 0)}</td><td>{formatMoney(paid)}</td><td><strong className={balance?.balanceMinor ? 'text-warning' : ''}>{formatMoney(balance?.balanceMinor ?? 0)}</strong></td><td><StatusBadge tone={supplier.archived ? 'neutral' : 'success'}>{supplier.archived ? 'Archived' : 'Active'}</StatusBadge></td><td className="align-right row-actions"><Button variant="quiet" size="sm" onClick={() => setHistory(supplier)}>History</Button>{Boolean(balance?.balanceMinor) && <Button variant="secondary" size="sm" icon={Wallet} onClick={() => setPay(supplier)}>Record payment</Button>}<Button variant="quiet" size="sm" icon={Pencil} onClick={() => setEdit(supplier)}>Edit</Button>{!supplier.archived && <Button variant="quiet" size="sm" icon={Archive} onClick={() => setArchiveTarget(supplier)}>Archive</Button>}</td></tr>;
      })}</tbody></table></div>}
    </Panel>
    {showForm && <SupplierForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); notify('Supplier added.'); }} />}
    {edit && <SupplierForm supplier={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); notify('Supplier details updated.'); }} />}
    {pay && <SupplierPaymentModal supplier={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); notify('Supplier payment recorded.'); }} />}
    {history && <SupplierHistory supplier={history} onClose={() => setHistory(null)} />}
    {archiveTarget && <ConfirmDialog title={`Archive ${archiveTarget.name}?`} description="Existing purchase and payment history will be preserved." onClose={() => setArchiveTarget(null)} onConfirm={() => void archive(archiveTarget)} confirmLabel="Archive supplier" danger />}
  </>;
}

function SupplierForm({ supplier, onClose, onSaved }: { supplier?: Supplier; onClose: () => void; onSaved: () => void }) {
  const { service } = useLedger();
  const [draft, setDraft] = useState<SupplierDraft>(supplier ? { name: supplier.name, phone: supplier.phone, email: supplier.email, notes: supplier.notes } : blankSupplier);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try { if (supplier) await service.updateSupplier({ ...supplier, ...draft, name: draft.name.trim() }); else await service.addSupplier(draft); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save supplier.'); }
    finally { setSaving(false); }
  }
  const update = (key: keyof SupplierDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <Modal title={supplier ? 'Edit supplier' : 'Add supplier'} description="Save supplier details and any useful payment terms." onClose={onClose}><form className="form-layout one-column" onSubmit={submit}><label className="field"><span>Supplier name</span><input required autoFocus maxLength={140} value={draft.name} onChange={(event) => update('name', event.target.value)} /></label><label className="field"><span>Phone <small>Optional</small></span><input maxLength={40} value={draft.phone} onChange={(event) => update('phone', event.target.value)} /></label><label className="field"><span>Email <small>Optional</small></span><input type="email" maxLength={200} value={draft.email} onChange={(event) => update('email', event.target.value)} /></label><label className="field"><span>Payment terms / notes</span><textarea rows={3} maxLength={1000} value={draft.notes} onChange={(event) => update('notes', event.target.value)} placeholder="e.g. Net 15 days" /></label><FormError message={error} /><FormActions onCancel={onClose} submitText={saving ? 'Saving…' : supplier ? 'Save changes' : 'Add supplier'} disabled={saving} /></form></Modal>;
}

function SupplierPaymentModal({ supplier, onClose, onSaved }: { supplier: Supplier; onClose: () => void; onSaved: () => void }) {
  const { snapshot, service } = useLedger();
  const balance = supplierBalances(snapshot).find((row) => row.partyId === supplier.id)?.balanceMinor ?? 0;
  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseMoneyInput(amount);
    if (amountMinor === null) { setError('Enter a valid amount.'); return; }
    setSaving(true);
    try { await service.recordPartyPayment({ partyType: 'supplier', partyId: supplier.id, amountMinor, method, note: '', operationKey: crypto.randomUUID() }); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record payment.'); }
    finally { setSaving(false); }
  }
  return <Modal title="Record supplier payment" description={`${supplier.name} · outstanding ${formatMoney(balance)}`} onClose={onClose}><form className="form-layout one-column" onSubmit={submit}><label className="field"><span>Amount paid <small>INR</small></span><input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="field"><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{['cash', 'upi', 'card', 'bank', 'other'].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label><FormError message={error} /><FormActions onCancel={onClose} submitText={saving ? 'Saving…' : 'Record payment'} disabled={saving || !balance} /></form></Modal>;
}

function SupplierHistory({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const { snapshot } = useLedger();
  const purchases = snapshot.purchases.filter((purchase) => purchase.supplierId === supplier.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const payments = snapshot.payments.filter((payment) => payment.partyType === 'supplier' && payment.partyId === supplier.id && payment.direction === 'out').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <Modal title="Supplier history" description={supplier.name} onClose={onClose} wide>{purchases.length ? <div className="table-scroll"><table><thead><tr><th>Reference</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th>Paid</th><th>Outstanding</th></tr></thead><tbody>{purchases.map((purchase) => { const paid = snapshot.payments.filter((payment) => payment.purchaseId === purchase.id && payment.direction === 'out').reduce((sum, payment) => sum + payment.amountMinor, 0); return <tr key={purchase.id}><td>{purchase.reference}</td><td>{formatDate(purchase.receivedAt ?? purchase.createdAt)}</td><td>{snapshot.purchaseItems.filter((item) => item.purchaseId === purchase.id).reduce((sum, item) => sum + item.quantity, 0)}</td><td>{formatMoney(purchase.subtotalMinor)}</td><td>{purchase.status}</td><td>{formatMoney(paid)}</td><td>{purchase.status === 'received' ? formatMoney(Math.max(0, purchase.subtotalMinor - paid)) : '—'}</td></tr>; })}</tbody></table></div> : <p className="muted">No purchases are linked to this supplier yet.</p>}<div className="receipt-totals"><div><span>Total received purchase value</span><strong>{formatMoney(purchases.filter((purchase) => purchase.status === 'received').reduce((sum, purchase) => sum + purchase.subtotalMinor, 0))}</strong></div></div><h3 className="history-section-title">Payment history</h3>{payments.length ? <div className="table-scroll"><table><thead><tr><th>Date</th><th>For</th><th>Method</th><th className="align-right">Paid</th></tr></thead><tbody>{payments.map((payment) => { const purchase = snapshot.purchases.find((row) => row.id === payment.purchaseId); return <tr key={payment.id}><td>{formatDate(payment.createdAt)}</td><td>{purchase?.reference ?? 'Supplier account'}</td><td>{payment.method.toUpperCase()}</td><td className="align-right">{formatMoney(payment.amountMinor)}</td></tr>; })}</tbody></table></div> : <p className="muted">No supplier payments recorded yet.</p>}</Modal>;
}

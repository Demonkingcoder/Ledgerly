import { useMemo, useState, type FormEvent } from 'react';
import { Archive, Pencil, Plus, UserRound, Wallet } from 'lucide-react';
import { useLedger } from '../../app/ledger-context';
import { useToast } from '../../components/toast';
import { Button, ConfirmDialog, EmptyState, FormActions, FormError, Modal, PageHeading, Panel, SearchInput, StatusBadge } from '../../components/ui';
import { customerBalances } from '../../domain/calculations';
import type { Customer, PaymentMethod } from '../../domain/models';
import { formatMoney, parseMoneyInput } from '../../domain/money';
import { formatDate } from '../../shared/format';

type PersonDraft = { name: string; address: string; phone: string; email: string; notes: string };
const emptyPerson: PersonDraft = { name: '', address: '', phone: '', email: '', notes: '' };

export function CustomersPage() {
  const { snapshot, service } = useLedger();
  const notify = useToast();
  const balances = customerBalances(snapshot);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Customer | null>(null);
  const [pay, setPay] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Customer | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  const rows = useMemo(() => snapshot.customers.filter((customer) => (includeArchived || !customer.archived) && `${customer.name} ${customer.address} ${customer.phone} ${customer.email}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [snapshot.customers, includeArchived, search]);
  const dueTotal = balances.reduce((sum, row) => sum + row.balanceMinor, 0);

  async function archive(customer: Customer) {
    try { await service.archiveCustomer(customer.id); notify(`${customer.name} archived.`); setArchiveTarget(null); }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not archive customer.', 'error'); }
  }

  return <>
    <PageHeading eyebrow="CUSTOMER ACCOUNTS" title="Customers" description="Keep contact details, purchase history, and receivables in one place." actions={<Button icon={Plus} onClick={() => setShowForm(true)}>Add customer</Button>} />
    <div className="mini-stats"><div><span>Active customers</span><strong>{snapshot.customers.filter((customer) => !customer.archived).length}</strong></div><div><span>Outstanding balances</span><strong>{formatMoney(dueTotal)}</strong></div><div><span>Saved sales</span><strong>{snapshot.sales.filter((sale) => sale.customerId).length}</strong></div></div>
    <Panel className="table-panel"><div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search customers or contact" /><label className="check-filter"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />Include archived</label></div>
      {rows.length === 0 ? <EmptyState title={snapshot.customers.length ? 'No matching customers' : 'Add your first customer'} description="Customer balances are calculated from saved sales and recorded payments." action={!snapshot.customers.length && <Button icon={Plus} onClick={() => setShowForm(true)}>Add customer</Button>} /> : <div className="table-scroll"><table><thead><tr><th>Customer</th><th>Contact</th><th>Sales</th><th>Total purchases</th><th>Balance due</th><th>Status</th><th className="align-right">Actions</th></tr></thead><tbody>{rows.map((customer) => {
        const balance = balances.find((row) => row.partyId === customer.id);
        const customerSales = snapshot.sales.filter((sale) => sale.customerId === customer.id);
        const total = customerSales.reduce((sum, sale) => sum + sale.totalMinor, 0);
        return <tr key={customer.id}><td><div className="product-cell"><span className="person-avatar">{customer.name.slice(0, 1).toUpperCase()}</span><div><strong className="table-primary">{customer.name}</strong><small className="table-subline">{customer.notes || (customerSales.at(-1) ? `Last purchase ${formatDate(customerSales.at(-1)!.createdAt)}` : 'No purchase yet')}</small></div></div></td><td><span>{customer.phone || '—'}</span>{customer.email && <small className="table-subline">{customer.email}</small>}{customer.address && <small className="table-subline">{customer.address}</small>}</td><td>{customerSales.length}</td><td>{formatMoney(total)}</td><td><strong className={balance?.balanceMinor ? 'text-warning' : ''}>{formatMoney(balance?.balanceMinor ?? 0)}</strong></td><td><StatusBadge tone={customer.archived ? 'neutral' : 'success'}>{customer.archived ? 'Archived' : 'Active'}</StatusBadge></td><td className="align-right row-actions"><Button variant="quiet" size="sm" icon={UserRound} onClick={() => setHistory(customer)}>History</Button>{Boolean(balance?.balanceMinor) && <Button variant="secondary" size="sm" icon={Wallet} onClick={() => setPay(customer)}>Record payment</Button>}<Button variant="quiet" size="sm" icon={Pencil} onClick={() => setEdit(customer)}>Edit</Button>{!customer.archived && <Button variant="quiet" size="sm" icon={Archive} onClick={() => setArchiveTarget(customer)}>Archive</Button>}</td></tr>;
      })}</tbody></table></div>}
    </Panel>
    {showForm && <CustomerForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); notify('Customer added.'); }} />}
    {edit && <CustomerForm customer={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); notify('Customer details updated.'); }} />}
    {pay && <PartyPaymentModal customer={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); notify('Customer payment recorded.'); }} />}
    {history && <CustomerHistory customer={history} onClose={() => setHistory(null)} />}
    {archiveTarget && <ConfirmDialog title={`Archive ${archiveTarget.name}?`} description="Their sales and payment history will remain available." onClose={() => setArchiveTarget(null)} onConfirm={() => void archive(archiveTarget)} confirmLabel="Archive customer" danger />}
  </>;
}

function CustomerForm({ customer, onClose, onSaved }: { customer?: Customer; onClose: () => void; onSaved: () => void }) {
  const { service } = useLedger();
  const [draft, setDraft] = useState<PersonDraft>(customer ? { name: customer.name, address: customer.address ?? '', phone: customer.phone, email: customer.email, notes: customer.notes } : emptyPerson);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      if (customer) await service.updateCustomer({ ...customer, ...draft, name: draft.name.trim() });
      else await service.addCustomer(draft);
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save customer.'); }
    finally { setSaving(false); }
  }
  const update = (key: keyof PersonDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <Modal title={customer ? 'Edit customer' : 'Add customer'} description="Save only the contact details your business needs." onClose={onClose}><form className="form-layout one-column" onSubmit={submit}><label className="field"><span>Name</span><input required autoFocus maxLength={140} value={draft.name} onChange={(event) => update('name', event.target.value)} /></label><label className="field"><span>Address <small>Optional</small></span><textarea autoComplete="street-address" rows={2} maxLength={300} value={draft.address} onChange={(event) => update('address', event.target.value)} /></label><label className="field"><span>Phone <small>Optional</small></span><input type="tel" maxLength={40} value={draft.phone} onChange={(event) => update('phone', event.target.value)} /></label><label className="field"><span>Email <small>Optional</small></span><input type="email" maxLength={200} value={draft.email} onChange={(event) => update('email', event.target.value)} /></label><label className="field"><span>Notes <small>Optional</small></span><textarea rows={3} maxLength={1000} value={draft.notes} onChange={(event) => update('notes', event.target.value)} /></label><FormError message={error} /><FormActions onCancel={onClose} submitText={saving ? 'Saving…' : customer ? 'Save changes' : 'Add customer'} disabled={saving} /></form></Modal>;
}

function PartyPaymentModal({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const { snapshot, service } = useLedger();
  const balance = customerBalances(snapshot).find((row) => row.partyId === customer.id)?.balanceMinor ?? 0;
  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseMoneyInput(amount);
    if (amountMinor === null) { setError('Enter a valid amount.'); return; }
    setSaving(true);
    try { await service.recordPartyPayment({ partyType: 'customer', partyId: customer.id, amountMinor, method, note: '', operationKey: crypto.randomUUID() }); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record payment.'); }
    finally { setSaving(false); }
  }
  return <Modal title="Record customer payment" description={`${customer.name} · outstanding ${formatMoney(balance)}`} onClose={onClose}><form className="form-layout one-column" onSubmit={submit}><label className="field"><span>Amount received <small>INR</small></span><input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="field"><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{['cash', 'upi', 'card', 'bank', 'other'].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label><FormError message={error} /><FormActions onCancel={onClose} submitText={saving ? 'Saving…' : 'Record payment'} disabled={saving || !balance} /></form></Modal>;
}

function CustomerHistory({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { snapshot } = useLedger();
  const sales = snapshot.sales.filter((sale) => sale.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const payments = snapshot.payments.filter((payment) => payment.partyType === 'customer' && payment.partyId === customer.id && payment.direction === 'in').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <Modal title="Customer history" description={`${customer.name}${customer.phone ? ` · ${customer.phone}` : ''}`} onClose={onClose} wide>{sales.length ? <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Date</th><th>Items</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>{sales.map((sale) => { const paid = snapshot.payments.filter((payment) => payment.saleId === sale.id && payment.direction === 'in').reduce((sum, payment) => sum + payment.amountMinor, 0); return <tr key={sale.id}><td>{sale.invoiceNo}</td><td>{formatDate(sale.createdAt)}</td><td>{snapshot.saleItems.filter((item) => item.saleId === sale.id).reduce((sum, item) => sum + item.quantity, 0)}</td><td>{formatMoney(sale.totalMinor)}</td><td>{formatMoney(paid)}</td><td>{formatMoney(Math.max(0, sale.totalMinor - paid))}</td></tr>; })}</tbody></table></div> : <p className="muted">No sales are linked to this customer yet.</p>}<div className="receipt-totals"><div className="receipt-total"><span>Total purchases</span><strong>{formatMoney(sales.reduce((sum, sale) => sum + sale.totalMinor, 0))}</strong></div></div><h3 className="history-section-title">Payment history</h3>{payments.length ? <div className="table-scroll"><table><thead><tr><th>Date</th><th>For</th><th>Method</th><th className="align-right">Received</th></tr></thead><tbody>{payments.map((payment) => { const sale = snapshot.sales.find((row) => row.id === payment.saleId); return <tr key={payment.id}><td>{formatDate(payment.createdAt)}</td><td>{sale?.invoiceNo ?? 'Customer account'}</td><td>{payment.method.toUpperCase()}</td><td className="align-right">{formatMoney(payment.amountMinor)}</td></tr>; })}</tbody></table></div> : <p className="muted">No customer payments recorded yet.</p>}</Modal>;
}

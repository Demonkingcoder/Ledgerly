import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, CloudOff, Download, HardDrive, LockKeyhole, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { useLedger } from '../../app/ledger-context';
import { useToast } from '../../components/toast';
import { Button, FormError, Modal, PageHeading, Panel, StatusBadge } from '../../components/ui';
import type { BusinessSettings, LedgerSnapshot } from '../../domain/models';
import { formatDate } from '../../shared/format';
import type { BackupDocument } from '../../domain/validation';

export function SettingsPage() {
  const { snapshot, service } = useLedger();
  const notify = useToast();
  const [draft, setDraft] = useState<BusinessSettings>(snapshot.settings);
  const [saving, setSaving] = useState(false);
  const [importPreview, setImportPreview] = useState<{ document: BackupDocument; counts: Record<string, number>; fileName: string } | null>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [taxPercent, setTaxPercent] = useState((snapshot.settings.taxRateBps / 100).toFixed(2));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rate = Number(taxPercent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { notify('Tax rate must be from 0% to 100%.', 'error'); return; }
    setSaving(true);
    try { await service.updateSettings({ ...draft, taxRateBps: Math.round(rate * 100) }); notify('Business settings saved.'); }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not save settings.', 'error'); }
    finally { setSaving(false); }
  }

  async function exportBackup() {
    try {
      const backup = await service.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ledgerly-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
      notify('Versioned backup exported. Keep a copy in a safe place.');
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not create backup.', 'error'); }
  }

  async function readBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportError(''); setImportPreview(null);
    try {
      const validated = await service.validateBackupText(await file.text());
      setImportPreview({ ...validated, fileName: file.name });
    } catch (reason) { setImportError(reason instanceof Error ? reason.message : 'This backup could not be validated.'); }
  }

  async function restore() {
    if (!importPreview) return;
    setImporting(true);
    try {
      await service.importBackup(importPreview.document.data as LedgerSnapshot);
      setDraft({ ...importPreview.document.data.settings, demoData: false });
      setImportPreview(null); notify('Backup restored. Your previous workspace was replaced.');
    } catch (reason) { setImportError(reason instanceof Error ? reason.message : 'Restore failed; saved records were left unchanged.'); }
    finally { setImporting(false); }
  }

  async function resetDemo() {
    if (!window.confirm('Reset this demo workspace to its original sample records? All changes in this demo workspace will be replaced.')) return;
    try { await service.resetDemoData(); setDraft((await service.snapshot()).settings); setTaxPercent('0.00'); notify('Demo workspace reset to its sample records.'); }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not reset demo data.', 'error'); }
  }

  const update = (key: keyof BusinessSettings, value: string | boolean | number) => setDraft((current) => ({ ...current, [key]: value }));
  return <>
    <PageHeading eyebrow="BUSINESS PREFERENCES" title="Settings & backup" description="Set up your shop details and manage a copy of your local records." />
    <div className="settings-grid"><div className="settings-main">
      <Panel className="settings-panel"><div className="panel-heading"><div><h2>Business profile</h2><p>Used on receipts and in your workspace.</p></div><span className="settings-icon"><HardDrive size={18} /></span></div><form className="form-layout" onSubmit={save}><label className="field full-field"><span>Business name</span><input required maxLength={140} value={draft.businessName} onChange={(event) => update('businessName', event.target.value)} /></label><label className="field"><span>Phone <small>Optional</small></span><input maxLength={40} value={draft.phone} onChange={(event) => update('phone', event.target.value)} /></label><label className="field"><span>Currency</span><input value="INR · Indian Rupee" readOnly /></label><label className="field full-field"><span>Address <small>Optional</small></span><input maxLength={300} value={draft.address} onChange={(event) => update('address', event.target.value)} /></label><div className="settings-divider full-field" /><label className="toggle-row full-field"><span><strong>Apply tax to new sales</strong><small>Tax is shown separately on receipts and excluded from sales revenue.</small></span><input type="checkbox" checked={draft.taxEnabled} onChange={(event) => update('taxEnabled', event.target.checked)} /></label><label className="field"><span>Tax rate</span><div className="input-suffix"><input type="number" min="0" max="100" step="0.01" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} /><span>%</span></div></label><label className="field"><span>Default reorder point</span><input type="number" min="0" max="100000" step="1" value={draft.defaultReorderPoint} onChange={(event) => update('defaultReorderPoint', Number(event.target.value))} /><small>Used as the starting threshold for new products.</small></label><div className="form-actions full-field"><Button type="submit" disabled={saving} icon={Check}>{saving ? 'Saving…' : 'Save settings'}</Button></div></form></Panel>
      <Panel className="settings-panel"><div className="panel-heading"><div><h2>Data backup & restore</h2><p>Backups use a versioned JSON file and are not encrypted.</p></div><span className="settings-icon"><ShieldCheck size={18} /></span></div><div className="backup-row"><div className="backup-icon"><Download size={17} /></div><div><strong>Export a backup</strong><small>Download products, sales, payments, purchases, contacts, and settings.</small></div><Button variant="secondary" size="sm" onClick={() => void exportBackup()}>Export</Button></div><div className="backup-row"><div className="backup-icon"><Upload size={17} /></div><div><strong>Restore from a backup</strong><small>Review file contents before replacing this workspace.</small></div><label className="button button-secondary button-sm file-input-button">Choose file<input type="file" accept="application/json,.json" onChange={(event) => void readBackup(event)} /></label></div>{importError && <FormError message={importError} />}<p className="security-note"><LockKeyhole size={15} /> Browser storage and JSON backups are not encrypted. Save backups in a location you control.</p></Panel>
      {draft.demoData && <Panel className="danger-panel"><div><strong>Reset demo data</strong><p>Restore sample records and remove changes from this demo workspace.</p></div><Button variant="danger" icon={RefreshCw} onClick={() => void resetDemo()}>Reset demo</Button></Panel>}
    </div><aside className="settings-side"><Panel><div className="panel-heading"><div><h2>Workspace status</h2><p>Where this app stores and sends data.</p></div></div><div className="status-detail"><HardDrive size={18} /><div><strong>Local browser storage</strong><small>IndexedDB on this device</small></div><StatusBadge tone="success">Active</StatusBadge></div><div className="status-detail"><CloudOff size={18} /><div><strong>Cloud sync</strong><small>Not configured in this MVP</small></div><StatusBadge>Unavailable</StatusBadge></div><p className="settings-footnote">Last saved records are stored by this browser profile. Clearing site data can remove them.</p><p className="settings-footnote">No authentication, encryption at rest, remote backup, or multi-user access is implemented.</p></Panel><Panel><div className="panel-heading"><div><h2>Workspace data</h2><p>Current local records</p></div></div><div className="data-counts">{[['Products', snapshot.products.length], ['Sales', snapshot.sales.length], ['Customers', snapshot.customers.length], ['Suppliers', snapshot.suppliers.length], ['Purchases', snapshot.purchases.length], ['Stock movements', snapshot.stockMovements.length]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="settings-footnote">{snapshot.settings.demoData ? 'Demo sample data is active.' : 'This workspace contains business records.'}</p></Panel><Panel className="security-card"><LockKeyhole size={18} /><h2>For real-world use</h2><p>Production needs server authentication, authorization, secure transport, server-side validation, access controls, encrypted backups where appropriate, tested recovery, and retention policies.</p></Panel></aside></div>
    {importPreview && <Modal title="Review backup import" description="This file passed the structure and version checks." onClose={() => setImportPreview(null)}><div className="import-preview"><strong>{importPreview.fileName}</strong><small>Exported {formatDate(importPreview.document.exportedAt)}</small>{Object.entries(importPreview.counts).map(([label, count]) => <div key={label}><span>{label[0].toUpperCase() + label.slice(1)}</span><strong>{count}</strong></div>)}</div><p className="warning-copy">Restoring replaces all current products, transactions, and contacts in this browser. The current data will not be merged.</p><div className="form-actions"><Button variant="secondary" onClick={() => setImportPreview(null)}>Cancel</Button><Button variant="danger" disabled={importing} onClick={() => void restore()}>{importing ? 'Restoring…' : 'Replace with this backup'}</Button></div></Modal>}
  </>;
}

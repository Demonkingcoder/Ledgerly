import type { LedgerRepository, NewCategory, NewCustomer, NewProduct, NewSupplier } from './ports';
import type { BusinessSettings, CreatePurchaseInput, LedgerSnapshot, RecordSaleInput } from '../domain/models';
import { assertSnapshotIntegrity } from '../domain/snapshot-integrity';
import { backupSchema, type BackupDocument } from '../domain/validation';

export class LedgerService {
  constructor(private readonly repository: LedgerRepository) {}

  initialize(options?: { startEmpty?: boolean }) { return this.repository.initialize(options); }
  snapshot(): Promise<LedgerSnapshot> { return this.repository.getSnapshot(); }
  subscribe(listener: () => void): () => void { return this.repository.subscribe(listener); }
  addProduct(input: NewProduct) { return this.repository.addProduct(input); }
  updateProduct(input: Parameters<LedgerRepository['updateProduct']>[0]) { return this.repository.updateProduct(input); }
  archiveProduct(id: string) { return this.repository.archiveProduct(id); }
  addCategory(input: NewCategory) { return this.repository.addCategory(input); }
  addCustomer(input: NewCustomer) { return this.repository.addCustomer(input); }
  updateCustomer(input: Parameters<LedgerRepository['updateCustomer']>[0]) { return this.repository.updateCustomer(input); }
  archiveCustomer(id: string) { return this.repository.archiveCustomer(id); }
  addSupplier(input: NewSupplier) { return this.repository.addSupplier(input); }
  updateSupplier(input: Parameters<LedgerRepository['updateSupplier']>[0]) { return this.repository.updateSupplier(input); }
  archiveSupplier(id: string) { return this.repository.archiveSupplier(id); }
  adjustStock(id: string, delta: number, reason: string) { return this.repository.adjustStock(id, delta, reason); }
  recordSale(input: RecordSaleInput) { return this.repository.recordSale(input); }
  recordSalePayment(input: Parameters<LedgerRepository['recordSalePayment']>[0]) { return this.repository.recordSalePayment(input); }
  createPurchase(input: CreatePurchaseInput) { return this.repository.createPurchase(input); }
  receivePurchase(id: string) { return this.repository.receivePurchase(id); }
  cancelPurchase(id: string) { return this.repository.cancelPurchase(id); }
  recordPartyPayment(input: Parameters<LedgerRepository['recordPartyPayment']>[0]) { return this.repository.recordPartyPayment(input); }
  updateSettings(settings: BusinessSettings) { return this.repository.updateSettings(settings); }
  importBackup(snapshot: LedgerSnapshot) { return this.repository.importBackup(snapshot); }
  resetDemoData() { return this.repository.resetDemoData(); }

  async exportBackup(): Promise<BackupDocument> {
    const data = await this.snapshot();
    return backupSchema.parse({ schemaVersion: 1, exportedAt: new Date().toISOString(), data });
  }

  async validateBackupText(text: string): Promise<{ document: BackupDocument; counts: Record<string, number> }> {
    if (new Blob([text]).size > 10 * 1024 * 1024) throw new Error('Backup file is too large. Choose a file under 10 MB.');
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
    const document = backupSchema.parse(parsed);
    assertSnapshotIntegrity(document.data);
    const counts = {
      products: document.data.products.length, sales: document.data.sales.length, customers: document.data.customers.length,
      suppliers: document.data.suppliers.length, purchases: document.data.purchases.length,
    };
    return { document, counts };
  }
}

import { useMemo, useState, type FormEvent } from 'react';
import { Archive, History, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { useLedger } from '../../app/ledger-context';
import { useToast } from '../../components/toast';
import { Button, ConfirmDialog, EmptyState, FormActions, FormError, Modal, PageHeading, Panel, SearchInput, StatusBadge } from '../../components/ui';
import type { Product } from '../../domain/models';
import { formatMoney, parseMoneyInput } from '../../domain/money';
import { formatDate } from '../../shared/format';

type ProductDraft = { name: string; sku: string; categoryName: string; unit: string; cost: string; price: string; quantity: string; reorderPoint: string };
const blankProduct: ProductDraft = { name: '', sku: '', categoryName: '', unit: 'pcs', cost: '0.00', price: '0.00', quantity: '0', reorderPoint: '10' };

export function InventoryPage() {
  const { snapshot, service } = useLedger();
  const notify = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [showProduct, setShowProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const visibleProducts = useMemo(() => snapshot.products.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku} ${product.categoryName}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'active' && !product.archived) || (filter === 'low' && !product.archived && product.quantity <= product.reorderPoint) || (filter === 'archived' && product.archived);
    const matchesCategory = categoryFilter === 'all' || product.categoryName === categoryFilter;
    const matchesStock = stockFilter === 'all' || (stockFilter === 'out' && product.quantity === 0) || (stockFilter === 'low' && product.quantity > 0 && product.quantity <= product.reorderPoint) || (stockFilter === 'healthy' && product.quantity > product.reorderPoint);
    return matchesSearch && matchesFilter && matchesCategory && matchesStock;
  }).sort((a, b) => sortBy === 'quantity-asc' ? a.quantity - b.quantity : sortBy === 'quantity-desc' ? b.quantity - a.quantity : sortBy === 'value-desc' ? b.costMinor * b.quantity - a.costMinor * a.quantity : a.name.localeCompare(b.name)), [snapshot.products, search, filter, categoryFilter, stockFilter, sortBy]);
  const active = snapshot.products.filter((product) => !product.archived);
  const stockValue = active.reduce((sum, product) => sum + product.costMinor * product.quantity, 0);
  const low = active.filter((product) => product.quantity <= product.reorderPoint).length;
  const margin = active.length ? active.reduce((sum, product) => sum + (product.priceMinor > 0 ? (product.priceMinor - product.costMinor) * product.quantity : 0), 0) : 0;

  async function archive(product: Product) {
    try { await service.archiveProduct(product.id); notify(`${product.name} archived. Historical records are preserved.`); setArchiveTarget(null); }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not archive product.', 'error'); }
  }

  return <>
    <PageHeading eyebrow="PRODUCTS & STOCK" title="Inventory" description="Know what is on hand, what it costs, and what to replenish." actions={<Button icon={Plus} onClick={() => setShowProduct(true)}>Add product</Button>} />
    <div className="mini-stats"><div><span>Active products</span><strong>{active.length}</strong></div><div><span>Inventory at cost</span><strong>{formatMoney(stockValue)}</strong></div><div><span>Estimated stock margin</span><strong>{formatMoney(margin)}</strong></div><div><span>At reorder point</span><strong className={low ? 'text-warning' : ''}>{low}</strong></div></div>
    <Panel className="table-panel"><div className="toolbar inventory-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search name, SKU or category" /><label className="select-label"><span className="sr-only">Filter products</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">Active products</option><option value="all">All products</option><option value="archived">Archived</option></select></label><label className="select-label"><span className="sr-only">Filter category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{[...new Set(snapshot.products.map((product) => product.categoryName).filter(Boolean))].sort().map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label className="select-label"><span className="sr-only">Filter stock status</span><select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}><option value="all">All stock</option><option value="healthy">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label><label className="select-label"><span className="sr-only">Sort products</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="name">Sort: name</option><option value="quantity-asc">Stock: lowest first</option><option value="quantity-desc">Stock: highest first</option><option value="value-desc">Value: highest first</option></select></label></div>
      {visibleProducts.length === 0 ? <EmptyState title={snapshot.products.length ? 'No matching products' : 'Start with your product list'} description={snapshot.products.length ? 'Adjust your search or filter.' : 'Add the items you sell to start tracking stock and margins.'} action={!snapshot.products.length && <Button icon={Plus} onClick={() => setShowProduct(true)}>Add product</Button>} /> : <>
        <div className="table-scroll inventory-table"><table><thead><tr><th>Product</th><th>Category</th><th>Cost</th><th>Price</th><th>Margin</th><th>On hand</th><th>Stock value</th><th className="align-right">Actions</th></tr></thead><tbody>{visibleProducts.map((product) => {
        const isLow = !product.archived && product.quantity <= product.reorderPoint;
        const marginPct = product.priceMinor > 0 ? Math.round(((product.priceMinor - product.costMinor) / product.priceMinor) * 100) : 0;
        return <tr key={product.id}><td><div className="product-cell"><span className="product-mini">{product.name.slice(0, 1)}</span><div><strong className="table-primary">{product.name}</strong><small className="table-subline">{product.sku || 'No SKU'} · per {product.unit}</small></div></div></td><td>{product.categoryName}</td><td>{formatMoney(product.costMinor)}</td><td>{formatMoney(product.priceMinor)}</td><td><span className="margin-value">{marginPct}%</span></td><td><strong>{product.quantity}</strong> <span className="muted">{product.unit}</span><small className="table-subline">Reorder at {product.reorderPoint}{isLow && <span className="low-inline"> · {product.quantity === 0 ? 'Out' : 'Low'}</span>}</small></td><td>{formatMoney(product.costMinor * product.quantity)}</td><td className="align-right row-actions"><Button variant="quiet" size="sm" icon={History} onClick={() => setHistoryProduct(product)}>History</Button><Button variant="quiet" size="sm" icon={SlidersHorizontal} onClick={() => setAdjustProduct(product)} disabled={product.archived}>Adjust</Button><Button variant="quiet" size="sm" icon={Pencil} onClick={() => setEditProduct(product)}>Edit</Button>{!product.archived && <Button variant="quiet" size="sm" icon={Archive} onClick={() => setArchiveTarget(product)}>Archive</Button>}</td></tr>;
      })}</tbody></table></div>
        <div className="inventory-mobile-list">{visibleProducts.map((product) => {
          const isLow = !product.archived && product.quantity <= product.reorderPoint;
          const marginPct = product.priceMinor > 0 ? Math.round(((product.priceMinor - product.costMinor) / product.priceMinor) * 100) : 0;
          return <article className="inventory-mobile-card" key={`mobile-${product.id}`}><div className="inventory-mobile-title"><span className="product-mini">{product.name.slice(0, 1)}</span><div><strong>{product.name}</strong><small>{product.sku || 'No SKU'} · {product.categoryName}</small></div><StatusBadge tone={product.archived ? 'neutral' : product.quantity === 0 ? 'danger' : isLow ? 'warning' : 'success'}>{product.archived ? 'Archived' : product.quantity === 0 ? 'Out' : isLow ? 'Low stock' : 'In stock'}</StatusBadge></div><div className="inventory-mobile-metrics"><div><small>On hand</small><strong>{product.quantity} {product.unit}</strong></div><div><small>Cost</small><strong>{formatMoney(product.costMinor)}</strong></div><div><small>Selling price</small><strong>{formatMoney(product.priceMinor)}</strong></div><div><small>Margin</small><strong>{marginPct}%</strong></div></div><div className="inventory-mobile-actions"><Button variant="quiet" size="sm" icon={History} onClick={() => setHistoryProduct(product)}>History</Button><Button variant="quiet" size="sm" icon={SlidersHorizontal} onClick={() => setAdjustProduct(product)} disabled={product.archived}>Adjust stock</Button><Button variant="quiet" size="sm" icon={Pencil} onClick={() => setEditProduct(product)}>Edit</Button>{!product.archived && <Button variant="quiet" size="sm" icon={Archive} onClick={() => setArchiveTarget(product)}>Archive</Button>}</div></article>;
        })}</div>
      </>}
    </Panel>
    {showProduct && <ProductForm onClose={() => setShowProduct(false)} onSaved={() => { setShowProduct(false); notify('Product added with opening stock recorded.'); }} />}
    {editProduct && <ProductForm product={editProduct} onClose={() => setEditProduct(null)} onSaved={() => { setEditProduct(null); notify('Product details updated.'); }} />}
    {adjustProduct && <StockAdjustment product={adjustProduct} onClose={() => setAdjustProduct(null)} onSaved={() => { setAdjustProduct(null); notify('Stock adjustment saved to history.'); }} />}
    {historyProduct && <MovementHistory product={historyProduct} onClose={() => setHistoryProduct(null)} />}
    {archiveTarget && <ConfirmDialog title={`Archive ${archiveTarget.name}?`} description="The product will stay on existing sale and purchase records." onClose={() => setArchiveTarget(null)} onConfirm={() => void archive(archiveTarget)} confirmLabel="Archive product" danger />}
  </>;
}

function ProductForm({ product, onClose, onSaved }: { product?: Product; onClose: () => void; onSaved: () => void }) {
  const { snapshot, service } = useLedger();
  const [draft, setDraft] = useState<ProductDraft>(() => product ? { name: product.name, sku: product.sku, categoryName: product.categoryName, unit: product.unit, cost: (product.costMinor / 100).toFixed(2), price: (product.priceMinor / 100).toFixed(2), quantity: String(product.quantity), reorderPoint: String(product.reorderPoint) } : { ...blankProduct, reorderPoint: String(snapshot.settings.defaultReorderPoint) });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const costMinor = parseMoneyInput(draft.cost);
    const priceMinor = parseMoneyInput(draft.price);
    const quantity = Number(draft.quantity);
    const reorderPoint = Number(draft.reorderPoint);
    if (costMinor === null || priceMinor === null || !Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(reorderPoint) || reorderPoint < 0) { setError('Enter valid prices and whole number stock quantities.'); return; }
    setSaving(true);
    try {
      if (product) await service.updateProduct({ ...product, name: draft.name.trim(), sku: draft.sku.trim(), categoryName: draft.categoryName.trim() || 'General', unit: draft.unit.trim(), costMinor, priceMinor, reorderPoint });
      else await service.addProduct({ name: draft.name.trim(), sku: draft.sku.trim(), categoryName: draft.categoryName.trim() || 'General', unit: draft.unit.trim(), costMinor, priceMinor, quantity, reorderPoint });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the product.'); }
    finally { setSaving(false); }
  }
  const update = (key: keyof ProductDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <Modal title={product ? 'Edit product' : 'Add product'} description={product ? 'Update item details. Stock changes belong in Stock adjustment.' : 'Add an item to your catalogue and set its opening stock.'} onClose={onClose}><form className="form-layout" onSubmit={submit}>
    <label className="field full-field"><span>Product name</span><input autoFocus required maxLength={140} value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. A4 Copier Paper" /></label>
    <label className="field"><span>SKU / code <small>Optional</small></span><input maxLength={64} value={draft.sku} onChange={(event) => update('sku', event.target.value)} /></label>
    <label className="field"><span>Category</span><input value={draft.categoryName} onChange={(event) => update('categoryName', event.target.value)} placeholder="General" /></label>
    <label className="field"><span>Unit</span><input required maxLength={24} value={draft.unit} onChange={(event) => update('unit', event.target.value)} placeholder="pcs, box, kg" /></label>
    <label className="field"><span>Reorder point</span><input type="number" min="0" step="1" value={draft.reorderPoint} onChange={(event) => update('reorderPoint', event.target.value)} /></label>
    <label className="field"><span>Cost price <small>INR / unit</small></span><input required inputMode="decimal" value={draft.cost} onChange={(event) => update('cost', event.target.value)} /></label>
    <label className="field"><span>Selling price <small>INR / unit</small></span><input required inputMode="decimal" value={draft.price} onChange={(event) => update('price', event.target.value)} /></label>
    {!product && <label className="field full-field"><span>Opening quantity</span><input type="number" min="0" step="1" value={draft.quantity} onChange={(event) => update('quantity', event.target.value)} /></label>}
    <FormError message={error} /><FormActions onCancel={onClose} submitText={saving ? 'Saving…' : product ? 'Save changes' : 'Add product'} disabled={saving} />
  </form></Modal>;
}

function StockAdjustment({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const { service } = useLedger();
  const [delta, setDelta] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantityDelta = Number(delta);
    if (!Number.isSafeInteger(quantityDelta) || quantityDelta === 0) { setError('Enter a positive or negative whole number.'); return; }
    if (!reason.trim()) { setError('Explain why the quantity is changing.'); return; }
    try { await service.adjustStock(product.id, quantityDelta, reason); onSaved(); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not adjust stock.'); }
  }
  return <Modal title="Adjust stock" description={`${product.name} · current stock ${product.quantity} ${product.unit}`} onClose={onClose}><form onSubmit={submit} className="form-layout one-column"><label className="field"><span>Quantity change</span><input type="number" step="1" value={delta} onChange={(event) => setDelta(event.target.value)} /><small>Use a negative number to remove stock.</small></label><label className="field"><span>Reason</span><input required maxLength={240} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Damaged stock, stock count" /></label><FormError message={error} /><FormActions onCancel={onClose} submitText="Save adjustment" /></form></Modal>;
}

function MovementHistory({ product, onClose }: { product: Product; onClose: () => void }) {
  const { snapshot } = useLedger();
  const rows = snapshot.stockMovements.filter((movement) => movement.productId === product.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <Modal title="Stock movement history" description={product.name} onClose={onClose} wide>{rows.length ? <div className="table-scroll"><table><thead><tr><th>Date</th><th>Reason</th><th>Type</th><th className="align-right">Change</th></tr></thead><tbody>{rows.map((movement) => <tr key={movement.id}><td>{formatDate(movement.createdAt)}</td><td>{movement.reason}</td><td>{movement.source}</td><td className={`align-right ${movement.quantityDelta > 0 ? 'text-success' : 'text-warning'}`}>{movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta} {product.unit}</td></tr>)}</tbody></table></div> : <EmptyState title="No movement history" description="Opening stock, sales, received purchases, and manual adjustments will appear here." />}</Modal>;
}

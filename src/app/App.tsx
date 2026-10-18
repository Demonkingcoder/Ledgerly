import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, Boxes, ChevronLeft, CircleHelp, House, Menu, Package, Settings2, ShieldCheck,
  ShoppingCart, Sparkles, Store, Users, X, MessageSquareText, ArrowRight,
} from 'lucide-react';
import { useLedger } from './ledger-context';
import { cloudConnectionConfigured } from './composition';
import { useToast } from '../components/toast';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { Button, FormError, TextInput } from '../components/ui';

const nav = [
  { label: 'Overview', to: '/', icon: House },
  { label: 'Sales & billing', to: '/sales', icon: ShoppingCart },
  { label: 'Inventory', to: '/inventory', icon: Boxes },
  { label: 'Purchases', to: '/purchases', icon: Package },
  { label: 'Customers', to: '/customers', icon: Users },
  { label: 'Suppliers', to: '/suppliers', icon: Store },
  { label: 'Reports', to: '/reports', icon: BarChart3 },
  { label: 'Business insights', to: '/assistant', icon: Sparkles },
];

function routeTitle(pathname: string) {
  return nav.find((item) => item.to === pathname)?.label ?? (pathname === '/settings' ? 'Settings' : 'Overview');
}

export function AppLayout() {
  const { snapshot, ready, error, service } = useLedger();
  const notify = useToast();
  const [mobileNav, setMobileNav] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(() => window.matchMedia('(max-width: 980px)').matches);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasMobileNavOpen = useRef(false);
  const [businessName, setBusinessName] = useState('');
  const [setupChoice, setSetupChoice] = useState<'empty' | 'sample'>('empty');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState('');
  const location = useLocation();
  const title = routeTitle(location.pathname);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 980px)');
    const updateViewport = () => {
      setMobileViewport(media.matches);
      if (!media.matches) setMobileNav(false);
    };
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (mainRef.current) mainRef.current.inert = mobileViewport && mobileNav;
  }, [mobileNav, mobileViewport]);

  useEffect(() => {
    if (mobileViewport && mobileNav) {
      wasMobileNavOpen.current = true;
      const firstLink = sidebarRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])');
      firstLink?.focus();
    } else if (wasMobileNavOpen.current) {
      wasMobileNavOpen.current = false;
      menuButtonRef.current?.focus();
    }
  }, [mobileNav, mobileViewport]);

  function handleSidebarKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!mobileViewport || !mobileNav) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMobileNav(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])]
      .filter((element) => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  }

  if (!ready) return <main className="boot-screen"><div className="brand-mark">L</div><p>Opening your local workspace…</p></main>;
  if (error) return <main className="storage-error"><div className="brand-mark">L</div><h1>Your local records could not be opened</h1><p>{error}</p><p className="muted">Your records have not been cleared. Try reopening Ledgerly in a browser that allows local site storage.</p></main>;
  if (!snapshot.settings.setupComplete) return <main className="setup-screen"><section className="setup-card">
    <div className="setup-brand"><div className="brand-mark"><Store size={19} /></div><div><strong>ledgerly</strong><small>Business, clearly.</small></div></div>
    <p className="eyebrow">A CLEARER WAY TO RUN YOUR SHOP</p><h1>Let’s set up your workspace</h1><p className="setup-description">Choose how you’d like to begin. Your records are saved in this browser and stay on this device.</p>
    <form className="form-layout one-column" onSubmit={async (event) => {
      event.preventDefault(); setSetupError(''); setSetupBusy(true);
      try {
        if (setupChoice === 'sample') await service.resetDemoData();
        const current = (await service.snapshot()).settings;
        await service.updateSettings({ ...current, businessName: businessName.trim() || current.businessName, demoData: setupChoice === 'sample', setupComplete: true, checklistDismissed: false });
        notify(setupChoice === 'sample' ? 'Sample workspace is ready. It is marked as demo data.' : 'Your empty workspace is ready. Add your first product to begin.');
      } catch (reason) { setSetupError(reason instanceof Error ? reason.message : 'Could not finish setting up this workspace.'); }
      finally { setSetupBusy(false); }
    }}>
      <label className="field"><span>Business name <small>Optional</small></span><TextInput autoFocus maxLength={140} value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="e.g. Greenleaf General Store" /></label>
      <div className="setup-options" aria-label="Choose workspace starting data">
        <button type="button" aria-pressed={setupChoice === 'empty'} className={`setup-option ${setupChoice === 'empty' ? 'setup-option-selected' : ''}`} onClick={() => setSetupChoice('empty')}><span className="setup-option-icon">＋</span><span><strong>Start with an empty workspace</strong><small>Add your own products and records when you’re ready.</small></span></button>
        <button type="button" aria-pressed={setupChoice === 'sample'} className={`setup-option ${setupChoice === 'sample' ? 'setup-option-selected' : ''}`} onClick={() => setSetupChoice('sample')}><span className="setup-option-icon">✦</span><span><strong>Explore sample data</strong><small>Use clearly marked examples to explore Ledgerly.</small></span></button>
      </div>
      <p className="setup-storage"><ShieldCheck size={16} /> Saved in this browser. Back up your records from Settings; they do not sync between devices.</p>
      <FormError message={setupError} />
      <Button type="submit" disabled={setupBusy} className="setup-submit">{setupBusy ? 'Preparing workspace…' : 'Continue'}<ArrowRight size={16} /></Button>
    </form>
  </section></main>;

  return <div className="app-frame">
    {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`} aria-hidden={mobileViewport && !mobileNav} role={mobileViewport && mobileNav ? 'dialog' : undefined} aria-label={mobileViewport && mobileNav ? 'Navigation menu' : undefined} aria-modal={mobileViewport && mobileNav ? true : undefined} onKeyDown={handleSidebarKeyDown}>
      <div className="brand"><div className="brand-mark"><Store size={18} /></div><div><strong>ledgerly</strong><small>Business, clearly.</small></div><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="workspace"><div className="workspace-avatar">{snapshot.settings.businessName.slice(0, 1).toUpperCase()}</div><div><strong>{snapshot.settings.businessName}</strong><span>{snapshot.settings.demoData ? 'Demo workspace' : 'Local workspace'}</span></div><ChevronLeft size={15} /></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        {nav.slice(0, 4).map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileNav(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Icon size={18} /><span>{label}</span>{to === '/inventory' && snapshot.products.filter((product) => !product.archived && product.quantity <= product.reorderPoint).length > 0 && <b>{snapshot.products.filter((product) => !product.archived && product.quantity <= product.reorderPoint).length}</b>}</NavLink>)}
      </nav>
      <div className="nav-label">RELATIONSHIPS</div>
      <nav className="main-nav" aria-label="Relationships">
        {nav.slice(4, 6).map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMobileNav(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Icon size={18} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="nav-label">INSIGHTS</div>
      <nav className="main-nav" aria-label="Insights">
        {nav.slice(6).map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMobileNav(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Icon size={18} /><span>{label}</span>{to === '/assistant' && <i className="local-tag">LOCAL</i>}</NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/settings" onClick={() => setMobileNav(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Settings2 size={18} /><span>Settings & backup</span></NavLink>
        <div className="storage-indicator"><span className="storage-dot" /><div><strong>Saved on this device</strong><small>{navigator.onLine ? 'Local mode · ready to work offline' : 'Offline · local records available'}</small></div></div>
        <div className="profile-row"><span className="profile-avatar">{snapshot.settings.businessName.slice(0, 1).toUpperCase()}</span><div><strong>Shop owner</strong><small>Local workspace</small></div><ShieldCheck size={17} /></div>
      </div>
    </aside>
    <main ref={mainRef} className="main-area">
      <header className="topbar"><div className="topbar-title"><button ref={menuButtonRef} className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={mobileViewport ? mobileNav : undefined} onClick={() => setMobileNav(true)}><Menu size={19} /></button><span>Workspace</span><i>·</i><strong>{title}</strong></div><div className="topbar-actions"><span className="connection-pill"><i />{cloudConnectionConfigured ? 'Local mode · sync not active' : navigator.onLine ? 'Saved on this device' : 'Offline · records available'}</span><Button variant="quiet" size="sm" icon={MessageSquareText} className="feedback-trigger" onClick={() => setFeedbackOpen(true)}>Send feedback</Button><span className="top-avatar" aria-label={snapshot.settings.businessName}>{snapshot.settings.businessName.slice(0, 1).toUpperCase()}</span></div></header>
      <div className="page-content"><Outlet /></div>
      <footer className="app-footer"><span>Ledgerly <i>·</i> Local-first retail management</span><button type="button" onClick={() => setFeedbackOpen(true)}><MessageSquareText size={14} /> Send feedback</button><span><CircleHelp size={13} /> Your records stay in this browser</span></footer>
    </main>
    {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
  </div>;
}

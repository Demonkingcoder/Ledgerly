import { useEffect, useRef, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X, type LucideIcon } from 'lucide-react';

export function Button({
  children, variant = 'primary', size = 'md', type = 'button', disabled = false, className = '', onClick, icon: Icon,
}: {
  children: ReactNode; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; size?: 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset'; disabled?: boolean; className?: string; onClick?: () => void; icon?: LucideIcon;
}) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`button button-${variant} button-${size} ${className}`}>
    {Icon && <Icon size={16} />}{children}
  </button>;
}

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div><div className="heading-actions">{actions}</div></div>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'green' }: { label: string; value: string; hint: string; icon: LucideIcon; tone?: 'green' | 'lime' | 'blue' | 'orange' }) {
  return <div className="stat-card"><div className={`stat-icon tone-${tone}`}><Icon size={18} /></div><p>{label}</p><strong>{value}</strong><small>{hint}</small></div>;
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }) {
  return <span className={`status-badge status-${tone}`}><i />{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-illustration">✳</div><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () => [...dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.getAttribute('aria-hidden') !== 'true' && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none');
    if (!dialog.contains(document.activeElement)) (focusableElements()[0] ?? dialog).focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-header"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

export function ConfirmDialog({
  title, description, onClose, onConfirm, confirmLabel = 'Confirm', workingLabel = 'Saving…', danger = false, busy = false,
}: {
  title: string; description: string; onClose: () => void; onConfirm: () => void | Promise<void>;
  confirmLabel?: string; workingLabel?: string; danger?: boolean; busy?: boolean;
}) {
  return <Modal title={title} description={description} onClose={onClose}>
    <div className="form-actions"><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => void onConfirm()} disabled={busy}>{busy ? workingLabel : confirmLabel}</Button></div>
  </Modal>;
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="search-input"><span className="sr-only">Search</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function FormActions({ onCancel, submitText, disabled = false }: { onCancel: () => void; submitText: string; disabled?: boolean }) {
  return <div className="form-actions"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={disabled}>{submitText}</Button></div>;
}

export function FormError({ message }: { message: string }) {
  return message ? <p className="form-error" role="alert">{message}</p> : null;
}

export function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return <label className={`field ${className}`}><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`control ${props.className ?? ''}`} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`control ${props.className ?? ''}`} />;
}

export function TextAreaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`control ${props.className ?? ''}`} />;
}

export function submitForm(handler: () => Promise<void>) {
  return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void handler(); };
}

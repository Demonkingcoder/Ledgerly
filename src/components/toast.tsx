import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';

type Toast = { id: number; message: string; tone: 'success' | 'error' };
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3800);
  }, []);
  return <ToastContext.Provider value={notify}>{children}<div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast toast-${toast.tone}`} key={toast.id}><span>{toast.tone === 'success' ? <Check size={16} /> : <CircleAlert size={16} />}</span><p>{toast.message}</p><button type="button" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Dismiss message"><X size={15} /></button></div>)}</div></ToastContext.Provider>;
}

export function useToast() { return useContext(ToastContext); }

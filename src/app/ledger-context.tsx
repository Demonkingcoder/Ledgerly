import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LedgerSnapshot } from '../domain/models';
import { emptySnapshot } from '../infrastructure/local/demo-data';
import { isStorageUnavailable } from '../infrastructure/local/dexie-ledger-repository';
import { ledgerService } from './composition';

interface LedgerContextValue {
  snapshot: LedgerSnapshot;
  ready: boolean;
  error: string | null;
  service: typeof ledgerService;
  refresh(): Promise<void>;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot>(emptySnapshot());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const next = await ledgerService.snapshot();
      setSnapshot(next);
      setError(null);
    } catch (reason) {
      setError(isStorageUnavailable(reason));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void ledgerService.initialize({ startEmpty: true }).then(async () => {
      if (mounted) await refresh();
    }).catch((reason: unknown) => {
      if (mounted) setError(isStorageUnavailable(reason));
    }).finally(() => {
      if (mounted) setReady(true);
    });
    const unsubscribe = ledgerService.subscribe(() => { void refresh(); });
    return () => { mounted = false; unsubscribe(); };
  }, [refresh]);

  const value = useMemo(() => ({ snapshot, ready, error, service: ledgerService, refresh }), [snapshot, ready, error, refresh]);
  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const context = useContext(LedgerContext);
  if (!context) throw new Error('useLedger must be used inside LedgerProvider.');
  return context;
}

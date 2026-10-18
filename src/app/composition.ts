import { LedgerService } from '../application/ledger-service';
import { DexieLedgerRepository } from '../infrastructure/local/dexie-ledger-repository';
import { ledgerDatabase } from '../infrastructure/local/database';
import { environment } from '../infrastructure/remote/environment';

const localRepository = new DexieLedgerRepository(ledgerDatabase);

export const ledgerService = new LedgerService(localRepository);
export const cloudConnectionConfigured = environment.remoteConfigured;

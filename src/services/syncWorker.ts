import { DB, getDb } from '../db/client';
import {
  Bet,
  getPendingSync,
  incrementSyncAttempts,
  updateBetStatus,
} from '../db/bets';
import { applyLedgerEntry } from '../db/balance';
import { confirmBet } from '../api/mockBackend';
import { now } from '../utils/time';

const MAX_SYNC_ATTEMPTS = 5;

export interface DrainSummary {
  skipped: boolean;
  processed: number;
  confirmed: number;
  failed: number;
  voided: number;
}

let draining = false;

// `dbArg` is a test seam — production callers omit it and the worker
// uses the module-level getDb() singleton. Tests pass an in-memory
// BetterSqliteDB.
export async function drain(dbArg?: DB): Promise<DrainSummary> {
  if (draining) {
    return { skipped: true, processed: 0, confirmed: 0, failed: 0, voided: 0 };
  }
  draining = true;
  const summary: DrainSummary = {
    skipped: false,
    processed: 0,
    confirmed: 0,
    failed: 0,
    voided: 0,
  };
  try {
    const db = dbArg ?? (await getDb());
    const pending = await getPendingSync(db);
    for (const bet of pending) {
      summary.processed += 1;
      try {
        const res = await confirmBet(bet);
        if (res.ok) {
          await updateBetStatus(db, bet.client_bet_id, 'PENDING_SETTLEMENT', {
            synced_at: res.confirmedAt,
          });
          summary.confirmed += 1;
        } else {
          await handleFailure(bet, summary, db);
        }
      } catch (err) {
        console.warn('[sync] confirmBet threw:', err);
        await handleFailure(bet, summary, db);
      }
    }
  } finally {
    draining = false;
  }
  return summary;
}

async function handleFailure(
  bet: Bet,
  summary: DrainSummary,
  db: DB,
): Promise<void> {
  const attempts = await incrementSyncAttempts(db, bet.client_bet_id);
  if (attempts >= MAX_SYNC_ATTEMPTS) {
    // Transition to VOID_REFUNDED and restore the stake atomically. Both
    // the status update and the refund ledger entry must commit or roll
    // back together so the ledger invariant always holds.
    await db.transaction(async (tx) => {
      await updateBetStatus(tx, bet.client_bet_id, 'VOID_REFUNDED', {
        settled_at: now(),
      });
      await applyLedgerEntry(
        tx,
        'refund_void',
        bet.stake_htgn,
        bet.client_bet_id,
        now(),
      );
    });
    summary.voided += 1;
  } else {
    summary.failed += 1;
  }
}

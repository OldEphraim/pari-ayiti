import { DB, getDb } from '../db/client';
import { applyLedgerEntry } from '../db/balance';
import {
  Bet,
  BetSelection,
  listBets,
  updateBetStatus,
} from '../db/bets';
import { getMatch, Match } from '../db/matches';
import { getSettlementProvider } from './settlementProviders';
import { now } from '../utils/time';

export interface SettlementSummary {
  skipped: boolean;
  processed: number;
  won: number;
  lost: number;
  deferred: number;
}

let settling = false;

function winningSelection(match: Match): BetSelection | null {
  if (match.home_score === null || match.away_score === null) return null;
  if (match.home_score > match.away_score) return 'home';
  if (match.home_score === match.away_score) return 'draw';
  return 'away';
}

// `dbArg` is a test seam; production callers omit it.
export async function settleDueBets(dbArg?: DB): Promise<SettlementSummary> {
  if (settling) {
    return {
      skipped: true,
      processed: 0,
      won: 0,
      lost: 0,
      deferred: 0,
    };
  }
  settling = true;
  const summary: SettlementSummary = {
    skipped: false,
    processed: 0,
    won: 0,
    lost: 0,
    deferred: 0,
  };
  const provider = getSettlementProvider();
  try {
    const db = dbArg ?? (await getDb());
    const pending = await listBets(db, { status: 'PENDING_SETTLEMENT' });
    for (const bet of pending) {
      summary.processed += 1;
      try {
        const match = await getMatch(db, bet.match_id);
        if (!match || match.status !== 'concluded') {
          summary.deferred += 1;
          continue;
        }
        const winner = winningSelection(match);
        if (winner === null) {
          // Concluded but no scores — data inconsistency; defer so a
          // future scores fetch can fix it.
          summary.deferred += 1;
          continue;
        }
        const outcome: 'won' | 'lost' = bet.selection === winner ? 'won' : 'lost';
        await provider.settle(bet, outcome);
        await applySettlement(bet, outcome, db);
        if (outcome === 'won') summary.won += 1;
        else summary.lost += 1;
      } catch (err) {
        console.warn('[settle] per-bet failed:', err);
        summary.deferred += 1;
      }
    }
  } finally {
    settling = false;
  }
  return summary;
}

async function applySettlement(
  bet: Bet,
  outcome: 'won' | 'lost',
  db: DB,
): Promise<void> {
  const settledAt = now();
  if (outcome === 'lost') {
    // No ledger entry — stake was already debited at placement.
    await updateBetStatus(db, bet.client_bet_id, 'SETTLED_LOST', {
      settled_at: settledAt,
    });
    return;
  }
  // Win path: transition + credit atomically so we never show a won bet
  // without its matching ledger entry.
  await db.transaction(async (tx) => {
    await updateBetStatus(tx, bet.client_bet_id, 'SETTLED_WON', {
      settled_at: settledAt,
    });
    await applyLedgerEntry(
      tx,
      'credit_winnings',
      bet.potential_payout_htgn,
      bet.client_bet_id,
      settledAt,
    );
  });
}

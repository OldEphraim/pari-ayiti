import { DB } from './client';

export type BetStatus =
  | 'PENDING_SYNC'
  | 'PENDING_SETTLEMENT'
  | 'SETTLED_WON'
  | 'SETTLED_LOST'
  | 'VOID_REFUNDED';

export type BetSelection = 'home' | 'draw' | 'away';

export interface Bet {
  client_bet_id: string;
  match_id: string;
  selection: BetSelection;
  stake_htgn: number;
  odds_at_placement: number;
  potential_payout_htgn: number;
  status: BetStatus;
  sync_attempts: number;
  placed_at: number;
  synced_at: number | null;
  settled_at: number | null;
  onchain_tx_id: string | null;
}

export interface CreateBetInput {
  client_bet_id: string;
  match_id: string;
  selection: BetSelection;
  stake_htgn: number;
  odds_at_placement: number;
  potential_payout_htgn: number;
  placed_at: number;
}

export async function createBet(db: DB, input: CreateBetInput): Promise<void> {
  // No ON CONFLICT clause — duplicate client_bet_id is a programming bug
  // (uuid v4 doesn't collide by accident) and the PRIMARY KEY violation
  // should surface to the caller rather than silently no-op. Callers that
  // legitimately need at-least-once semantics live in workers that check
  // state before re-inserting.
  await db.run(
    `INSERT INTO bets (
       client_bet_id, match_id, selection, stake_htgn,
       odds_at_placement, potential_payout_htgn, status,
       sync_attempts, placed_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_SYNC', 0, ?)`,
    [
      input.client_bet_id,
      input.match_id,
      input.selection,
      input.stake_htgn,
      input.odds_at_placement,
      input.potential_payout_htgn,
      input.placed_at,
    ],
  );
}

export interface UpdateBetFields {
  synced_at?: number | null;
  settled_at?: number | null;
  onchain_tx_id?: string | null;
}

export async function updateBetStatus(
  db: DB,
  client_bet_id: string,
  status: BetStatus,
  fields: UpdateBetFields = {},
): Promise<void> {
  const sets: string[] = ['status = ?'];
  const vals: unknown[] = [status];
  if (fields.synced_at !== undefined) {
    sets.push('synced_at = ?');
    vals.push(fields.synced_at);
  }
  if (fields.settled_at !== undefined) {
    sets.push('settled_at = ?');
    vals.push(fields.settled_at);
  }
  if (fields.onchain_tx_id !== undefined) {
    sets.push('onchain_tx_id = ?');
    vals.push(fields.onchain_tx_id);
  }
  vals.push(client_bet_id);
  await db.run(
    `UPDATE bets SET ${sets.join(', ')} WHERE client_bet_id = ?`,
    vals,
  );
}

export interface ListBetsFilter {
  status?: BetStatus;
  statuses?: BetStatus[];
  match_id?: string;
}

export async function listBets(db: DB, filter: ListBetsFilter = {}): Promise<Bet[]> {
  const wheres: string[] = [];
  const vals: unknown[] = [];
  if (filter.status) {
    wheres.push('status = ?');
    vals.push(filter.status);
  }
  if (filter.statuses && filter.statuses.length > 0) {
    const placeholders = filter.statuses.map(() => '?').join(', ');
    wheres.push(`status IN (${placeholders})`);
    vals.push(...filter.statuses);
  }
  if (filter.match_id) {
    wheres.push('match_id = ?');
    vals.push(filter.match_id);
  }
  const where = wheres.length ? ` WHERE ${wheres.join(' AND ')}` : '';
  return db.query<Bet>(
    `SELECT * FROM bets${where} ORDER BY placed_at DESC`,
    vals,
  );
}

export async function getPendingSync(db: DB): Promise<Bet[]> {
  return db.query<Bet>(
    `SELECT * FROM bets WHERE status = 'PENDING_SYNC' ORDER BY placed_at ASC`,
  );
}

export async function getPendingSettlementDue(db: DB, now: number): Promise<Bet[]> {
  return db.query<Bet>(
    `SELECT b.* FROM bets b
     JOIN matches m ON m.id = b.match_id
     WHERE b.status = 'PENDING_SETTLEMENT'
       AND (m.commence_time + 7200) <= ?
     ORDER BY b.placed_at ASC`,
    [now],
  );
}

export async function incrementSyncAttempts(
  db: DB,
  client_bet_id: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.run(
      `UPDATE bets SET sync_attempts = sync_attempts + 1 WHERE client_bet_id = ?`,
      [client_bet_id],
    );
    const rows = await tx.query<{ sync_attempts: number }>(
      `SELECT sync_attempts FROM bets WHERE client_bet_id = ?`,
      [client_bet_id],
    );
    return rows[0]?.sync_attempts ?? 0;
  });
}

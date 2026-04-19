import { DB } from './client';

export type LedgerKind =
  | 'initial_grant'
  | 'debit_stake'
  | 'credit_winnings'
  | 'refund_void';

export interface LedgerEntry {
  id: number;
  kind: LedgerKind;
  amount_htgn_minor: number;
  related_bet_id: string | null;
  created_at: number;
}

export async function getBalance(db: DB): Promise<number> {
  const rows = await db.query<{ htgn_minor: number }>(
    `SELECT htgn_minor FROM balance WHERE id = 1`,
  );
  if (rows.length === 0) {
    throw new Error('balance row missing — schema not initialized');
  }
  return rows[0].htgn_minor;
}

export async function listLedger(db: DB): Promise<LedgerEntry[]> {
  return db.query<LedgerEntry>(
    `SELECT id, kind, amount_htgn_minor, related_bet_id, created_at
     FROM balance_ledger
     ORDER BY id DESC`,
  );
}

export interface LedgerRow extends LedgerEntry {
  match_home_team: string | null;
  match_away_team: string | null;
}

export async function listLedgerEntries(db: DB): Promise<LedgerRow[]> {
  return db.query<LedgerRow>(
    `SELECT bl.id, bl.kind, bl.amount_htgn_minor, bl.related_bet_id, bl.created_at,
            m.home_team AS match_home_team, m.away_team AS match_away_team
     FROM balance_ledger bl
     LEFT JOIN bets b ON b.client_bet_id = bl.related_bet_id
     LEFT JOIN matches m ON m.id = b.match_id
     ORDER BY bl.id DESC`,
  );
}

export async function applyLedgerEntry(
  db: DB,
  kind: LedgerKind,
  amount_htgn_minor: number,
  related_bet_id: string | null = null,
  created_at: number = Math.floor(Date.now() / 1000),
): Promise<number> {
  if (!Number.isInteger(amount_htgn_minor)) {
    throw new Error(
      `amount_htgn_minor must be an integer (minor units); got ${amount_htgn_minor}`,
    );
  }
  return db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO balance_ledger (kind, amount_htgn_minor, related_bet_id, created_at)
       VALUES (?, ?, ?, ?)`,
      [kind, amount_htgn_minor, related_bet_id, created_at],
    );
    await tx.run(
      `UPDATE balance SET htgn_minor = htgn_minor + ? WHERE id = 1`,
      [amount_htgn_minor],
    );
    const rows = await tx.query<{ htgn_minor: number }>(
      `SELECT htgn_minor FROM balance WHERE id = 1`,
    );
    return rows[0].htgn_minor;
  });
}

export interface ReconcileResult {
  balance: number;
  ledgerSum: number;
}

export async function reconcileBalance(db: DB): Promise<ReconcileResult> {
  const balRows = await db.query<{ htgn_minor: number }>(
    `SELECT htgn_minor FROM balance WHERE id = 1`,
  );
  const sumRows = await db.query<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount_htgn_minor), 0) AS total FROM balance_ledger`,
  );
  const balance = balRows[0]?.htgn_minor ?? 0;
  const ledgerSum = sumRows[0]?.total ?? 0;
  if (balance !== ledgerSum) {
    throw new Error(
      `Balance invariant violated: balance=${balance} ledgerSum=${ledgerSum}`,
    );
  }
  return { balance, ledgerSum };
}

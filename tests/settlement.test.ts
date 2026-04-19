import { BetterSqliteDB } from '../src/db/betterSqliteDb';
import {
  BetSelection,
  BetStatus,
  listBets,
  updateBetStatus,
} from '../src/db/bets';
import { markConcluded } from '../src/db/matches';
import {
  getBalance,
  LedgerEntry,
  listLedger,
} from '../src/db/balance';
import { settleDueBets } from '../src/services/settlementWorker';
import { openTestDb, seedBetAndDebit, seedMatch } from './helpers';

const MATCH_ID = 'm-settle';
const STAKE_MINOR = 5_000;
const ODDS = 2.0;
const PAYOUT = 10_000;
const INITIAL_BALANCE = 500_000;

interface Seeded {
  db: BetterSqliteDB;
}

async function seedThreeBets(db: BetterSqliteDB): Promise<void> {
  const selections: BetSelection[] = ['home', 'draw', 'away'];
  for (const sel of selections) {
    await seedBetAndDebit(db, {
      client_bet_id: `bet-${sel}`,
      match_id: MATCH_ID,
      selection: sel,
      stake_htgn: STAKE_MINOR,
      odds_at_placement: ODDS,
      potential_payout_htgn: PAYOUT,
      placed_at: 1_781_000_000,
    });
    // Workers promote bets to PENDING_SETTLEMENT after the sync worker
    // confirms; the settlement test starts from that state directly.
    await updateBetStatus(db, `bet-${sel}`, 'PENDING_SETTLEMENT');
  }
}

async function setup(): Promise<Seeded> {
  const db = await openTestDb();
  await seedMatch(db, { id: MATCH_ID });
  await seedThreeBets(db);
  return { db };
}

function creditsFor(entries: LedgerEntry[], betId: string): LedgerEntry[] {
  return entries.filter(
    (e) => e.kind === 'credit_winnings' && e.related_bet_id === betId,
  );
}

describe('settlementWorker.settleDueBets', () => {
  test('home win (2-1): only home bet wins, balance credited once', async () => {
    const { db } = await setup();

    await markConcluded(db, MATCH_ID, 2, 1);
    const summary = await settleDueBets(db);

    expect(summary.processed).toBe(3);
    expect(summary.won).toBe(1);
    expect(summary.lost).toBe(2);

    const bets = await listBets(db);
    const byId = new Map(bets.map((b) => [b.client_bet_id, b]));
    expect(byId.get('bet-home')?.status).toBe<BetStatus>('SETTLED_WON');
    expect(byId.get('bet-draw')?.status).toBe<BetStatus>('SETTLED_LOST');
    expect(byId.get('bet-away')?.status).toBe<BetStatus>('SETTLED_LOST');

    const ledger = await listLedger(db);
    expect(creditsFor(ledger, 'bet-home')).toHaveLength(1);
    expect(creditsFor(ledger, 'bet-home')[0].amount_htgn_minor).toBe(PAYOUT);
    expect(creditsFor(ledger, 'bet-draw')).toHaveLength(0);
    expect(creditsFor(ledger, 'bet-away')).toHaveLength(0);

    // initial - 3 stakes + 1 payout
    const expected = INITIAL_BALANCE - 3 * STAKE_MINOR + PAYOUT;
    expect(await getBalance(db)).toBe(expected);
    db.close();
  });

  test('draw (1-1): only draw bet wins', async () => {
    const { db } = await setup();
    await markConcluded(db, MATCH_ID, 1, 1);
    const summary = await settleDueBets(db);

    expect(summary.won).toBe(1);
    expect(summary.lost).toBe(2);

    const bets = await listBets(db);
    const byId = new Map(bets.map((b) => [b.client_bet_id, b]));
    expect(byId.get('bet-home')?.status).toBe<BetStatus>('SETTLED_LOST');
    expect(byId.get('bet-draw')?.status).toBe<BetStatus>('SETTLED_WON');
    expect(byId.get('bet-away')?.status).toBe<BetStatus>('SETTLED_LOST');

    const ledger = await listLedger(db);
    expect(creditsFor(ledger, 'bet-draw')).toHaveLength(1);
    expect(await getBalance(db)).toBe(
      INITIAL_BALANCE - 3 * STAKE_MINOR + PAYOUT,
    );
    db.close();
  });

  test('away win (1-2): only away bet wins', async () => {
    const { db } = await setup();
    await markConcluded(db, MATCH_ID, 1, 2);
    const summary = await settleDueBets(db);

    expect(summary.won).toBe(1);
    expect(summary.lost).toBe(2);

    const bets = await listBets(db);
    const byId = new Map(bets.map((b) => [b.client_bet_id, b]));
    expect(byId.get('bet-home')?.status).toBe<BetStatus>('SETTLED_LOST');
    expect(byId.get('bet-draw')?.status).toBe<BetStatus>('SETTLED_LOST');
    expect(byId.get('bet-away')?.status).toBe<BetStatus>('SETTLED_WON');

    const ledger = await listLedger(db);
    expect(creditsFor(ledger, 'bet-away')).toHaveLength(1);
    expect(await getBalance(db)).toBe(
      INITIAL_BALANCE - 3 * STAKE_MINOR + PAYOUT,
    );
    db.close();
  });

  test('match not yet concluded: settlement defers and makes no state changes', async () => {
    const { db } = await setup();
    // Do not markConcluded.
    const summary = await settleDueBets(db);

    expect(summary.processed).toBe(3);
    expect(summary.deferred).toBe(3);
    expect(summary.won).toBe(0);
    expect(summary.lost).toBe(0);

    const bets = await listBets(db);
    for (const bet of bets) {
      expect(bet.status).toBe<BetStatus>('PENDING_SETTLEMENT');
      expect(bet.settled_at).toBeNull();
    }
    expect(await getBalance(db)).toBe(INITIAL_BALANCE - 3 * STAKE_MINOR);
    db.close();
  });

  test('settle_at timestamp is populated for both won and lost bets', async () => {
    const { db } = await setup();
    await markConcluded(db, MATCH_ID, 2, 1);
    await settleDueBets(db);
    const bets = await listBets(db);
    for (const bet of bets) {
      expect(bet.settled_at).not.toBeNull();
      expect(bet.settled_at! > 0).toBe(true);
    }
    db.close();
  });
});

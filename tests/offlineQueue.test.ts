import { BetterSqliteDB } from '../src/db/betterSqliteDb';
import {
  BetSelection,
  BetStatus,
  CreateBetInput,
  listBets,
} from '../src/db/bets';
import { getBalance, listLedger } from '../src/db/balance';
import { drain } from '../src/services/syncWorker';
import {
  __resetMockBackend,
  __setTestHooks,
  ConfirmResult,
} from '../src/api/mockBackend';
import { openTestDb, seedBetAndDebit, seedMatch } from './helpers';

const MATCH_ID = 'm-offline';
const STAKE_MINOR = 1_000;
const ODDS = 2.0;
const PAYOUT = 2_000;
const INITIAL_BALANCE = 500_000;

async function seedPendingSyncBets(
  db: BetterSqliteDB,
  count: number,
  prefix: string,
): Promise<CreateBetInput[]> {
  const selections: BetSelection[] = ['home', 'draw', 'away'];
  const inputs: CreateBetInput[] = [];
  for (let i = 0; i < count; i++) {
    const input: CreateBetInput = {
      client_bet_id: `${prefix}-${i}`,
      match_id: MATCH_ID,
      selection: selections[i % 3],
      stake_htgn: STAKE_MINOR,
      odds_at_placement: ODDS,
      potential_payout_htgn: PAYOUT,
      placed_at: 1_781_000_000 + i,
    };
    await seedBetAndDebit(db, input);
    inputs.push(input);
  }
  return inputs;
}

describe('offline queue: syncWorker.drain', () => {
  let db: BetterSqliteDB;

  beforeEach(async () => {
    db = await openTestDb();
    __resetMockBackend();
    __setTestHooks({ delayMs: 0 });
    await seedMatch(db, { id: MATCH_ID });
  });

  afterEach(() => {
    __resetMockBackend();
    db.close();
  });

  test('100% failure mode: after 5 drains, all bets are VOID_REFUNDED with refund ledger entries and balance is fully restored', async () => {
    __setTestHooks({
      delayMs: 0,
      confirm: async (): Promise<ConfirmResult> => ({
        ok: false,
        reason: 'forced test failure',
      }),
    });
    await seedPendingSyncBets(db, 3, 'void');

    // 4 drains — below the 5-attempt threshold. Bets stay PENDING_SYNC.
    for (let i = 1; i <= 4; i++) {
      const s = await drain(db);
      expect(s.processed).toBe(3);
      expect(s.failed).toBe(3);
      expect(s.voided).toBe(0);
    }
    let bets = await listBets(db);
    for (const b of bets) {
      expect(b.status).toBe<BetStatus>('PENDING_SYNC');
      expect(b.sync_attempts).toBe(4);
    }

    // 5th drain → attempts hit 5 → transition to VOID_REFUNDED + refund.
    const s5 = await drain(db);
    expect(s5.voided).toBe(3);
    bets = await listBets(db);
    for (const b of bets) {
      expect(b.status).toBe<BetStatus>('VOID_REFUNDED');
      expect(b.sync_attempts).toBe(5);
    }

    const ledger = await listLedger(db);
    const refunds = ledger.filter((e) => e.kind === 'refund_void');
    expect(refunds.length).toBe(3);
    for (const r of refunds) {
      expect(r.amount_htgn_minor).toBe(STAKE_MINOR);
    }
    // Balance fully restored: 3 debits of -STAKE, then 3 refunds of +STAKE.
    expect(await getBalance(db)).toBe(INITIAL_BALANCE);
  });

  test('100% success mode: one drain moves every bet to PENDING_SETTLEMENT, no extra ledger entries', async () => {
    __setTestHooks({
      delayMs: 0,
      confirm: async (bet): Promise<ConfirmResult> => ({
        ok: true,
        serverBetId: `srv-${bet.client_bet_id}`,
        confirmedAt: 1_781_000_500,
      }),
    });
    await seedPendingSyncBets(db, 3, 'ok');
    const ledgerBefore = await listLedger(db);

    const s = await drain(db);
    expect(s.confirmed).toBe(3);
    expect(s.failed).toBe(0);
    expect(s.voided).toBe(0);

    const bets = await listBets(db);
    for (const b of bets) {
      expect(b.status).toBe<BetStatus>('PENDING_SETTLEMENT');
      expect(b.synced_at).toBe(1_781_000_500);
    }

    // No new ledger entries — only the original 3 debits stand.
    const ledgerAfter = await listLedger(db);
    expect(ledgerAfter.length).toBe(ledgerBefore.length);
  });

  test('mixed mode: deterministic fail-then-succeed per bet; both bets reach PENDING_SETTLEMENT after enough drains', async () => {
    const attempts = new Map<string, number>();
    __setTestHooks({
      delayMs: 0,
      confirm: async (bet): Promise<ConfirmResult> => {
        const n = (attempts.get(bet.client_bet_id) ?? 0) + 1;
        attempts.set(bet.client_bet_id, n);
        // fail on odd attempts (1st, 3rd, …), succeed on even (2nd, 4th, …)
        if (n % 2 === 1) return { ok: false, reason: 'alt' };
        return {
          ok: true,
          serverBetId: `srv-${bet.client_bet_id}`,
          confirmedAt: 1_781_000_900,
        };
      },
    });
    await seedPendingSyncBets(db, 2, 'mix');

    // Drain 1: both fail → sync_attempts=1, status unchanged.
    const s1 = await drain(db);
    expect(s1.failed).toBe(2);

    // Drain 2: both succeed → PENDING_SETTLEMENT.
    const s2 = await drain(db);
    expect(s2.confirmed).toBe(2);

    const bets = await listBets(db);
    for (const b of bets) {
      expect(b.status).toBe<BetStatus>('PENDING_SETTLEMENT');
    }
  });

  test('concurrency guard: two unawaited drains run → second short-circuits', async () => {
    // Slow the mock so the first drain holds the flag long enough for the
    // second call to race it. 50 ms is plenty.
    __setTestHooks({
      delayMs: 50,
      confirm: async (bet): Promise<ConfirmResult> => ({
        ok: true,
        serverBetId: `srv-${bet.client_bet_id}`,
        confirmedAt: 1_781_000_100,
      }),
    });
    await seedPendingSyncBets(db, 2, 'conc');

    const p1 = drain(db);
    const p2 = drain(db);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.skipped).toBe(false);
    expect(r1.processed).toBe(2);
    expect(r2.skipped).toBe(true);
    expect(r2.processed).toBe(0);

    const bets = await listBets(db);
    for (const b of bets) {
      expect(b.status).toBe<BetStatus>('PENDING_SETTLEMENT');
    }
  });
});

import {
  Bet,
  BetStatus,
  createBet,
  incrementSyncAttempts,
  listBets,
  updateBetStatus,
} from '../src/db/bets';
import { BetterSqliteDB } from '../src/db/betterSqliteDb';
import { openTestDb, seedMatch } from './helpers';

describe('bets DAO', () => {
  let db: BetterSqliteDB;

  beforeEach(async () => {
    db = await openTestDb();
    await seedMatch(db, { id: 'm-1' });
  });

  afterEach(() => {
    db.close();
  });

  test('createBet inserts a row with status PENDING_SYNC', async () => {
    await createBet(db, {
      client_bet_id: 'bet-1',
      match_id: 'm-1',
      selection: 'home',
      stake_htgn: 5000,
      odds_at_placement: 2.0,
      potential_payout_htgn: 10_000,
      placed_at: 1_781_000_000,
    });
    const rows = await listBets(db);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe<BetStatus>('PENDING_SYNC');
    expect(rows[0].sync_attempts).toBe(0);
  });

  test('createBet with a duplicate client_bet_id throws (PRIMARY KEY invariant)', async () => {
    // No code-level ON CONFLICT — the DB enforces uniqueness and the
    // caller has to handle the throw. Silent upsert would hide client bugs
    // that produce duplicate UUIDs.
    const input = {
      client_bet_id: 'bet-dup',
      match_id: 'm-1',
      selection: 'home' as const,
      stake_htgn: 1000,
      odds_at_placement: 2.0,
      potential_payout_htgn: 2000,
      placed_at: 1_781_000_000,
    };
    await createBet(db, input);
    await expect(createBet(db, input)).rejects.toThrow();
    const rows = await listBets(db);
    expect(rows.length).toBe(1);
  });

  test('updateBetStatus is permissive — the DAO does not enforce the state machine', async () => {
    // State-machine validity is the workers' responsibility (sync worker
    // decides when PENDING_SYNC → VOID_REFUNDED; settlement worker decides
    // when PENDING_SETTLEMENT → SETTLED_*). DAO-level enforcement would
    // block legitimate recovery paths (e.g., manual support adjustments
    // or Phase 9 admin tooling). See offlineQueue.test.ts for the
    // state-machine assertions at the worker boundary.
    await createBet(db, {
      client_bet_id: 'bet-x',
      match_id: 'm-1',
      selection: 'draw',
      stake_htgn: 500,
      odds_at_placement: 3.5,
      potential_payout_htgn: 1750,
      placed_at: 1_781_000_000,
    });

    const terminalTransitions: BetStatus[] = [
      'PENDING_SETTLEMENT',
      'SETTLED_WON',
      'SETTLED_LOST',
      'VOID_REFUNDED',
      'PENDING_SYNC',
    ];
    for (const status of terminalTransitions) {
      await updateBetStatus(db, 'bet-x', status);
      const bet = (await listBets(db))[0];
      expect(bet.status).toBe(status);
    }
  });

  test('updateBetStatus applies optional timestamp fields', async () => {
    await createBet(db, {
      client_bet_id: 'bet-t',
      match_id: 'm-1',
      selection: 'away',
      stake_htgn: 1000,
      odds_at_placement: 4.0,
      potential_payout_htgn: 4000,
      placed_at: 1_781_000_000,
    });
    await updateBetStatus(db, 'bet-t', 'PENDING_SETTLEMENT', {
      synced_at: 1_781_000_500,
    });
    await updateBetStatus(db, 'bet-t', 'SETTLED_LOST', {
      settled_at: 1_781_010_000,
    });
    const bet = (await listBets(db))[0];
    expect(bet.synced_at).toBe(1_781_000_500);
    expect(bet.settled_at).toBe(1_781_010_000);
    expect(bet.status).toBe<BetStatus>('SETTLED_LOST');
  });

  test('incrementSyncAttempts is atomic and returns the new count', async () => {
    await createBet(db, {
      client_bet_id: 'bet-s',
      match_id: 'm-1',
      selection: 'home',
      stake_htgn: 100,
      odds_at_placement: 2.0,
      potential_payout_htgn: 200,
      placed_at: 1_781_000_000,
    });
    for (let i = 1; i <= 5; i++) {
      const n = await incrementSyncAttempts(db, 'bet-s');
      expect(n).toBe(i);
    }
    const bet = (await listBets(db))[0];
    expect(bet.sync_attempts).toBe(5);
  });

  test('listBets filters by status and match_id', async () => {
    await seedMatch(db, { id: 'm-2' });
    const mk = (id: string, match_id: string, status: BetStatus): Bet => ({
      client_bet_id: id,
      match_id,
      selection: 'home',
      stake_htgn: 100,
      odds_at_placement: 2.0,
      potential_payout_htgn: 200,
      status,
      sync_attempts: 0,
      placed_at: 1_781_000_000,
      synced_at: null,
      settled_at: null,
      onchain_tx_id: null,
    });
    // Use createBet + updateBetStatus to install bets in varied states.
    const seed = async (id: string, match_id: string, status: BetStatus) => {
      await createBet(db, {
        client_bet_id: id,
        match_id,
        selection: 'home',
        stake_htgn: 100,
        odds_at_placement: 2.0,
        potential_payout_htgn: 200,
        placed_at: 1_781_000_000,
      });
      if (status !== 'PENDING_SYNC') await updateBetStatus(db, id, status);
      void mk;
    };
    await seed('a', 'm-1', 'PENDING_SYNC');
    await seed('b', 'm-1', 'PENDING_SETTLEMENT');
    await seed('c', 'm-2', 'PENDING_SYNC');

    expect((await listBets(db, { status: 'PENDING_SYNC' })).length).toBe(2);
    expect((await listBets(db, { match_id: 'm-2' })).length).toBe(1);
    expect(
      (await listBets(db, { statuses: ['PENDING_SYNC', 'PENDING_SETTLEMENT'] }))
        .length,
    ).toBe(3);
  });
});

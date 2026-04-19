import { BetterSqliteDB } from '../src/db/betterSqliteDb';
import { Match, upsertMatches } from '../src/db/matches';
import { CreateBetInput, createBet } from '../src/db/bets';
import { applyLedgerEntry } from '../src/db/balance';

export async function openTestDb(): Promise<BetterSqliteDB> {
  return BetterSqliteDB.open(':memory:');
}

export async function seedMatch(
  db: BetterSqliteDB,
  overrides: Partial<Match> & { id: string },
): Promise<Match> {
  const match: Match = {
    sport_key: 'soccer_fifa_world_cup',
    commence_time: 1_781_000_000,
    home_team: 'Home',
    away_team: 'Away',
    odds_home: 2.0,
    odds_draw: 3.5,
    odds_away: 4.0,
    status: 'upcoming',
    home_score: null,
    away_score: null,
    last_fetched: 0,
    ...overrides,
  };
  await upsertMatches(db, [match]);
  return match;
}

// Seeds a bet + the matching debit_stake ledger row atomically, as the
// real placeBet flow would. Useful for setting up settlement/offline tests.
export async function seedBetAndDebit(
  db: BetterSqliteDB,
  input: CreateBetInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await createBet(tx, input);
    await applyLedgerEntry(
      tx,
      'debit_stake',
      -input.stake_htgn,
      input.client_bet_id,
      input.placed_at,
    );
  });
}

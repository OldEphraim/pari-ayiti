import { DB } from '../db/client';
import {
  getMatch,
  Match,
  MatchStatus,
  upsertMatches,
} from '../db/matches';
import { getPendingSync } from '../db/bets';
import { listBets } from '../db/bets';
import {
  fetchWorldCupOdds,
  fetchWorldCupScores,
  hasApiKey,
  NormalizedMatch,
} from '../api/odds';
import { currentlyOnline, isOnline } from './connectivity';
import { now } from '../utils/time';
import fixtureJson from '../api/fixtures/worldCupMatches.json';

const CACHE_TTL_SECONDS = 30 * 60;

interface FixtureRow {
  id: string;
  sport_key: string;
  commence_time: number;
  home_team: string;
  away_team: string;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  last_fetched: number;
}

function fixtureMatches(): Match[] {
  // Typed narrowing at the JSON boundary. TS can't validate the JSON's
  // status field against our union, so we assert once here.
  const raw = fixtureJson as FixtureRow[];
  return raw.map((r) => ({
    id: r.id,
    sport_key: r.sport_key,
    commence_time: r.commence_time,
    home_team: r.home_team,
    away_team: r.away_team,
    odds_home: r.odds_home,
    odds_draw: r.odds_draw,
    odds_away: r.odds_away,
    status: r.status,
    home_score: r.home_score,
    away_score: r.away_score,
    last_fetched: r.last_fetched,
  }));
}

// Sport key the fixture and live-API data share. Used to distinguish real
// World Cup rows from DEV smoke-test debris (sport_key='soccer_smoke').
const FIXTURE_SPORT_KEY = 'soccer_fifa_world_cup';

export async function loadInitialMatches(db: DB): Promise<void> {
  // Seed if no World Cup rows exist — regardless of whether unrelated
  // dev artifacts (smoke tests) are in the table. Seeding is idempotent
  // via upsertMatches' ON CONFLICT DO UPDATE.
  const rows = await db.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM matches WHERE sport_key = ?`,
    [FIXTURE_SPORT_KEY],
  );
  const existing = rows[0]?.n ?? 0;
  if (existing > 0) return;
  await upsertMatches(db, fixtureMatches());
}

async function latestFetchAge(db: DB): Promise<number> {
  const rows = await db.query<{ m: number | null }>(
    `SELECT MAX(last_fetched) AS m FROM matches`,
  );
  const latest = rows[0]?.m ?? 0;
  return Math.max(0, now() - (latest ?? 0));
}

export interface RefreshSummary {
  attempted: boolean;
  reason?: string;
  updatedCount?: number;
}

export async function refreshMatches(
  db: DB,
  opts: { force?: boolean } = {},
): Promise<RefreshSummary> {
  const force = opts.force === true;
  if (!hasApiKey()) {
    return { attempted: false, reason: 'no api key' };
  }
  if (!force) {
    const age = await latestFetchAge(db);
    if (age < CACHE_TTL_SECONDS) {
      return { attempted: false, reason: `cache fresh (${age}s)` };
    }
  }
  const online = force ? true : await isOnline();
  if (!online && !force) {
    return { attempted: false, reason: 'offline' };
  }
  const result = await fetchWorldCupOdds();
  if (!result.ok) {
    return { attempted: true, reason: result.reason };
  }
  const fetchedAt = now();
  const merged: Match[] = result.data.map((m: NormalizedMatch) => ({
    id: m.id,
    sport_key: m.sport_key,
    commence_time: m.commence_time,
    home_team: m.home_team,
    away_team: m.away_team,
    odds_home: m.odds_home,
    odds_draw: m.odds_draw,
    odds_away: m.odds_away,
    status: m.status,
    home_score: null,
    away_score: null,
    last_fetched: fetchedAt,
  }));
  await upsertMatches(db, merged);
  return { attempted: true, updatedCount: merged.length };
}

export interface MatchesSnapshot {
  count: number;
  lastFetched: number | null;
  first: Match[];
}

export async function getMatchesSnapshot(
  db: DB,
  limit: number = 3,
): Promise<MatchesSnapshot> {
  // Filter to World Cup rows so the diagnostic view hides DEV smoke-test
  // matches (sport_key='soccer_smoke').
  const countRows = await db.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM matches WHERE sport_key = ?`,
    [FIXTURE_SPORT_KEY],
  );
  const lastRows = await db.query<{ m: number | null }>(
    `SELECT MAX(last_fetched) AS m FROM matches WHERE sport_key = ?`,
    [FIXTURE_SPORT_KEY],
  );
  const firstRows = await db.query<Match>(
    `SELECT * FROM matches WHERE sport_key = ?
     ORDER BY commence_time ASC LIMIT ?`,
    [FIXTURE_SPORT_KEY, limit],
  );
  return {
    count: countRows[0]?.n ?? 0,
    lastFetched: lastRows[0]?.m ?? null,
    first: firstRows,
  };
}

export async function fetchScoresForDueMatches(db: DB): Promise<RefreshSummary> {
  if (!hasApiKey()) {
    return { attempted: false, reason: 'no api key' };
  }
  if (!currentlyOnline()) {
    // Cheap gate; the full isOnline() check fires inside refreshMatches too
    // but scores only run when the settlement worker needs them.
    return { attempted: false, reason: 'offline' };
  }
  // Derive match IDs from bets awaiting settlement. Unused in Phase 5 — the
  // settlement worker (Phase 7) calls this; for now it exists so the worker
  // has an entry point ready.
  const pending = await listBets(db, { status: 'PENDING_SETTLEMENT' });
  // getPendingSync is imported for the Phase 7 sync-worker side; reference it
  // here to keep the import graph intentional until then.
  void getPendingSync;
  const needingScores = new Set(pending.map((b) => b.match_id));
  if (needingScores.size === 0) {
    return { attempted: false, reason: 'no bets due' };
  }
  const result = await fetchWorldCupScores(3);
  if (!result.ok) {
    return { attempted: true, reason: result.reason };
  }
  let updated = 0;
  for (const s of result.data) {
    if (!needingScores.has(s.id)) continue;
    if (!s.completed) continue;
    if (s.home_score === null || s.away_score === null) continue;
    const existing = await getMatch(db, s.id);
    if (!existing) continue;
    await upsertMatches(db, [
      {
        ...existing,
        status: 'concluded',
        home_score: s.home_score,
        away_score: s.away_score,
        last_fetched: now(),
      },
    ]);
    updated += 1;
  }
  return { attempted: true, updatedCount: updated };
}

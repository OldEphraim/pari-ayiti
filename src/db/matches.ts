import { DB } from './client';

export type MatchStatus = 'upcoming' | 'live' | 'concluded';

export interface Match {
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

export async function upsertMatches(db: DB, matches: Match[]): Promise<void> {
  if (matches.length === 0) return;
  await db.transaction(async (tx) => {
    for (const m of matches) {
      await tx.run(
        `INSERT INTO matches (
           id, sport_key, commence_time, home_team, away_team,
           odds_home, odds_draw, odds_away, status,
           home_score, away_score, last_fetched
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           sport_key = excluded.sport_key,
           commence_time = excluded.commence_time,
           home_team = excluded.home_team,
           away_team = excluded.away_team,
           odds_home = excluded.odds_home,
           odds_draw = excluded.odds_draw,
           odds_away = excluded.odds_away,
           status = excluded.status,
           home_score = excluded.home_score,
           away_score = excluded.away_score,
           last_fetched = excluded.last_fetched`,
        [
          m.id,
          m.sport_key,
          m.commence_time,
          m.home_team,
          m.away_team,
          m.odds_home,
          m.odds_draw,
          m.odds_away,
          m.status,
          m.home_score,
          m.away_score,
          m.last_fetched,
        ],
      );
    }
  });
}

export async function listUpcoming(db: DB): Promise<Match[]> {
  return db.query<Match>(
    `SELECT * FROM matches WHERE status != 'concluded' ORDER BY commence_time ASC`,
  );
}

export async function listAllMatches(db: DB): Promise<Match[]> {
  return db.query<Match>(`SELECT * FROM matches ORDER BY commence_time ASC`);
}

export async function getMatch(db: DB, id: string): Promise<Match | null> {
  const rows = await db.query<Match>(`SELECT * FROM matches WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function markConcluded(
  db: DB,
  id: string,
  home_score: number,
  away_score: number,
): Promise<void> {
  await db.run(
    `UPDATE matches
     SET status = 'concluded', home_score = ?, away_score = ?
     WHERE id = ?`,
    [home_score, away_score, id],
  );
}

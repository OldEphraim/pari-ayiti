export interface Migration {
  version: number;
  sql: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    sql: [
      `CREATE TABLE matches (
         id TEXT PRIMARY KEY,
         sport_key TEXT NOT NULL,
         commence_time INTEGER NOT NULL,
         home_team TEXT NOT NULL,
         away_team TEXT NOT NULL,
         odds_home REAL,
         odds_draw REAL,
         odds_away REAL,
         status TEXT NOT NULL,
         home_score INTEGER,
         away_score INTEGER,
         last_fetched INTEGER NOT NULL
       )`,
      `CREATE TABLE bets (
         client_bet_id TEXT PRIMARY KEY,
         match_id TEXT NOT NULL,
         selection TEXT NOT NULL,
         stake_htgn INTEGER NOT NULL,
         odds_at_placement REAL NOT NULL,
         potential_payout_htgn INTEGER NOT NULL,
         status TEXT NOT NULL,
         sync_attempts INTEGER NOT NULL DEFAULT 0,
         placed_at INTEGER NOT NULL,
         synced_at INTEGER,
         settled_at INTEGER,
         onchain_tx_id TEXT,
         FOREIGN KEY (match_id) REFERENCES matches(id)
       )`,
      `CREATE TABLE balance (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         htgn_minor INTEGER NOT NULL
       )`,
      `CREATE TABLE balance_ledger (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         kind TEXT NOT NULL,
         amount_htgn_minor INTEGER NOT NULL,
         related_bet_id TEXT,
         created_at INTEGER NOT NULL,
         FOREIGN KEY (related_bet_id) REFERENCES bets(client_bet_id)
       )`,
      `INSERT INTO balance (id, htgn_minor) VALUES (1, 500000)`,
      `INSERT INTO balance_ledger (kind, amount_htgn_minor, related_bet_id, created_at)
       VALUES ('initial_grant', 500000, NULL, CAST(strftime('%s','now') AS INTEGER))`,
    ],
  },
];

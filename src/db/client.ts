import * as SQLite from 'expo-sqlite';
import { migrations } from './schema';

export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface DB {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T>;
}

// Parameters passed to expo-sqlite bindings. expo-sqlite's SQLiteBindValue is
// `string | number | null | Uint8Array` — bigint is not supported in the RN
// runtime, so we don't accept it here either. BetterSqliteDB's own binding is
// wider but this type is only used by the Expo impl.
export type SqlParam = string | number | null | Uint8Array;

function toSqlParams(params: unknown[] | undefined): SqlParam[] {
  return (params ?? []) as SqlParam[];
}

export class ExpoSqliteDB implements DB {
  private inTx = false;

  private constructor(private readonly raw: SQLite.SQLiteDatabase) {}

  static async open(name: string): Promise<ExpoSqliteDB> {
    const raw = await SQLite.openDatabaseAsync(name);
    await raw.execAsync('PRAGMA foreign_keys = ON;');
    const db = new ExpoSqliteDB(raw);
    await applyMigrations(db);
    return db;
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.raw.getAllAsync<T>(sql, toSqlParams(params));
  }

  async run(sql: string, params?: unknown[]): Promise<RunResult> {
    const r = await this.raw.runAsync(sql, toSqlParams(params));
    return { lastInsertRowId: r.lastInsertRowId, changes: r.changes };
  }

  async transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    this.inTx = true;
    try {
      let captured: T;
      let assigned = false;
      await this.raw.withTransactionAsync(async () => {
        captured = await fn(this);
        assigned = true;
      });
      if (!assigned) {
        throw new Error('transaction callback did not complete');
      }
      return captured!;
    } finally {
      this.inTx = false;
    }
  }
}

export async function applyMigrations(db: DB): Promise<void> {
  await db.run(
    `CREATE TABLE IF NOT EXISTS meta (
       key TEXT PRIMARY KEY NOT NULL,
       value TEXT NOT NULL
     )`,
  );
  const rows = await db.query<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'schema_version'`,
  );
  const current = rows.length > 0 ? parseInt(rows[0].value, 10) : 0;
  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.transaction(async (tx) => {
      for (const stmt of migration.sql) {
        await tx.run(stmt);
      }
      await tx.run(
        `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(migration.version)],
      );
    });
  }
}

let _db: ExpoSqliteDB | null = null;
let _dbPromise: Promise<ExpoSqliteDB> | null = null;

export async function getDb(): Promise<DB> {
  if (_db) return _db;
  if (!_dbPromise) {
    _dbPromise = ExpoSqliteDB.open('pari-ayiti.db').then((db) => {
      _db = db;
      return db;
    });
  }
  return _dbPromise;
}

// Node-only test implementation of the DB interface. Imported ONLY by Jest
// tests in Phase 8 — the React Native bundle never touches this file because
// `better-sqlite3` is a native Node module that Metro cannot bundle.

import Database from 'better-sqlite3';
import { applyMigrations, DB, RunResult } from './client';

export class BetterSqliteDB implements DB {
  private inTx = false;

  private constructor(private readonly raw: Database.Database) {}

  static async open(name: string = ':memory:'): Promise<BetterSqliteDB> {
    const raw = new Database(name);
    raw.pragma('foreign_keys = ON');
    const db = new BetterSqliteDB(raw);
    await applyMigrations(db);
    return db;
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.raw.prepare(sql);
    const rows = stmt.all(...(params ?? [])) as T[];
    return Promise.resolve(rows);
  }

  async run(sql: string, params?: unknown[]): Promise<RunResult> {
    const stmt = this.raw.prepare(sql);
    const info = stmt.run(...(params ?? []));
    return Promise.resolve({
      lastInsertRowId: Number(info.lastInsertRowid),
      changes: info.changes,
    });
  }

  async transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    this.inTx = true;
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      this.raw.exec('COMMIT');
      return result;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    } finally {
      this.inTx = false;
    }
  }

  close(): void {
    this.raw.close();
  }
}

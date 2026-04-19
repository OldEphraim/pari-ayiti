// Test-only shim. Tests use BetterSqliteDB directly; nothing in a test
// path should ever construct an ExpoSqliteDB or call openDatabaseAsync.
// If it does, this surfaces loudly instead of crashing with a native
// resolution error.

export async function openDatabaseAsync(): Promise<never> {
  throw new Error(
    '[test] expo-sqlite.openDatabaseAsync called — tests must use BetterSqliteDB',
  );
}

export type SQLiteDatabase = unknown;

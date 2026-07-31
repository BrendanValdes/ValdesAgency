import type { SqliteDatabase } from "./database.js";

export function withTransaction<T>(
  database: SqliteDatabase,
  operation: () => T,
): T {
  return database.transaction(operation)();
}

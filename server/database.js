import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Tiny adapter so local SQLite and hosted D1 use the same SQL and request handler.
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA journal_mode = WAL');
  if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'scores'").get()) {
    sqlite.exec(readFileSync(new URL('../migrations/0001_scores.sql', import.meta.url), 'utf8'));
  }
  function prepare(sql, values = []) {
    const stmt = sqlite.prepare(sql);
    return {
      bind: (...args) => prepare(sql, args),
      all: () => ({ results: stmt.all(...values) }),
      run: () => ({ meta: { changes: Number(stmt.run(...values).changes) } }),
    };
  }
  return {
    prepare,
    batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(stmt => stmt.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close: () => sqlite.close(),
  };
}

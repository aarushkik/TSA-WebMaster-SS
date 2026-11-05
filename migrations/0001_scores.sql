CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  team_key TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX scores_created_at ON scores(created_at);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), paused INTEGER NOT NULL DEFAULT 0);

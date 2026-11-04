-- COSMOS internal database, schema v1 (plan §12.4).
-- Lives in the app data dir, never inside the vault.

CREATE TABLE projects (
  id                    TEXT PRIMARY KEY,
  slug                  TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  universe              TEXT NOT NULL DEFAULT 'Desenvolvimento',
  created_at            INTEGER NOT NULL,
  format_version        INTEGER NOT NULL DEFAULT 1,
  archived              INTEGER NOT NULL DEFAULT 0,
  repo_manifest_enabled INTEGER NOT NULL DEFAULT 0,  -- D1: off by default
  mirror_enabled        INTEGER NOT NULL DEFAULT 0   -- R14: off until explicit consent
);

CREATE TABLE bindings (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind       TEXT NOT NULL CHECK (kind IN ('path','git_root_commit','git_remote','marker','workspace')),
  value      TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, value)
);

CREATE TABLE sessions (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT REFERENCES projects(id),
  agent              TEXT NOT NULL,
  harness_session_id TEXT,
  cwd                TEXT,
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER,
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','closed','interrupted','pending_consolidation')),
  summary_source     TEXT CHECK (summary_source IN ('agent','rules','local_ai','user')),
  last_event_at      INTEGER
);
CREATE INDEX sessions_by_harness ON sessions(agent, harness_session_id);

CREATE TABLE events (
  id              TEXT PRIMARY KEY,           -- ULID
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id      TEXT,
  session_id      TEXT,
  agent           TEXT NOT NULL,
  type            TEXT NOT NULL,
  payload         TEXT NOT NULL DEFAULT '{}', -- JSON
  base_rev        TEXT,
  created_at      INTEGER NOT NULL,
  processed_at    INTEGER                     -- NULL = to be (re)projected
);
CREATE INDEX events_unprocessed ON events(processed_at) WHERE processed_at IS NULL;
CREATE INDEX events_by_project ON events(project_id, created_at);

CREATE TABLE doc_revs (
  project_id TEXT NOT NULL,
  doc        TEXT NOT NULL,
  rev        TEXT NOT NULL,
  event_id   TEXT,
  written_at INTEGER NOT NULL
);
CREATE INDEX doc_revs_by_doc ON doc_revs(project_id, doc, written_at);

CREATE TABLE mirror_consent (
  vault_id    TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 0,
  destination TEXT,
  accepted_at INTEGER,
  revoked_at  INTEGER
);

CREATE TABLE mirror_manifest (
  project_id       TEXT NOT NULL,
  rel_path         TEXT NOT NULL,
  last_synced_hash TEXT,
  last_synced_rev  TEXT,
  written_at       INTEGER,
  PRIMARY KEY (project_id, rel_path)
);

CREATE TABLE mirror_conflicts (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  rel_path         TEXT NOT NULL,
  user_hash        TEXT NOT NULL,
  cosmos_hash      TEXT NOT NULL,
  cosmos_copy_path TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','kept_user','used_cosmos','merged','deferred')),
  created_at       INTEGER NOT NULL,
  resolved_at      INTEGER,
  UNIQUE (project_id, rel_path, cosmos_hash)
);

CREATE TABLE capture_settings (
  project_id              TEXT PRIMARY KEY,
  capture_initial_prompt  INTEGER NOT NULL DEFAULT 1,
  capture_full_transcript INTEGER NOT NULL DEFAULT 0,
  allowed_agents          TEXT,  -- JSON
  excluded_globs          TEXT   -- JSON
);

CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  scopes       TEXT NOT NULL,  -- JSON
  projects     TEXT NOT NULL,  -- JSON
  expires_at   INTEGER,
  revoked_at   INTEGER,
  last_used_at INTEGER
);

CREATE VIRTUAL TABLE fts USING fts5(
  project_id UNINDEXED, doc, section, body,
  tokenize = 'unicode61 remove_diacritics 2'
);

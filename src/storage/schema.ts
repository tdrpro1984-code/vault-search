/**
 * SQLite schema for vault-curate v1.0.0.
 *
 * See openspec/changes/004-vault-curate-rebrand/design.md D2 for the full
 * rationale. Highlights:
 *   - notes.body_vec = mean-pool of chunks vectors only (NO title, NO description).
 *   - chunks.chunk_index is 0-based within a note.
 *   - BM25 is computed in TypeScript (src/storage/bm25.ts) over chunks.content,
 *     NOT via an FTS5 virtual table — sql.js 1.14.1 ships without FTS5 compiled
 *     in. See Phase 2 retry log (G3 R5) for the rationale. API contract on
 *     SQLiteStore.searchBM25 is unchanged.
 *   - meta is a key-value store for schema_version, embedding_model_id,
 *     embedding_provider, embedding_dim, last_indexed_at, weight_bm25,
 *     weight_semantic, weight_fuzzy, last_migration_from.
 */
import type { Database } from 'sql.js';

export const SCHEMA_VERSION = '1';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS notes (
    path        TEXT PRIMARY KEY,
    mtime       INTEGER NOT NULL,
    title       TEXT,
    description TEXT,
    tier        TEXT,
    body_vec    BLOB,
    body_dim    INTEGER NOT NULL,
    indexed_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    note_path    TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    vec          BLOB NOT NULL,
    UNIQUE(note_path, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_note ON chunks(note_path);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS synonyms (
    term      TEXT NOT NULL,
    expansion TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_synonyms_term ON synonyms(term);
`;

/**
 * Apply schema (idempotent). Sets schema_version meta if not present.
 */
export function applySchema(db: Database): void {
    db.exec(SCHEMA_SQL);
    // Set schema_version only if not yet set (first-init signal).
    const existing = db.exec("SELECT value FROM meta WHERE key='schema_version'");
    if (existing.length === 0 || existing[0].values.length === 0) {
        db.run("INSERT INTO meta(key, value) VALUES('schema_version', ?)", [SCHEMA_VERSION]);
    }
}

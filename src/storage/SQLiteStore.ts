/**
 * SQLiteStore — typed high-level facade over sql.js for vault-curate.
 *
 * Design rationale: see openspec/changes/004-vault-curate-rebrand/design.md D2.
 *
 * Key contract:
 *   - All SQL is encapsulated here; consumers MUST NOT touch raw db.exec.
 *   - Float32Array <-> BLOB via vecCodec.
 *   - FTS5 input is pre-tokenised via cjkTokenize (matches index + query side).
 *   - Persistence is debounced: every 100 mutations or 30s idle triggers save.
 */
import type { Database } from 'sql.js';
import { openDb, exportDb } from './sqlJsRuntime';
import { applySchema } from './schema';
import { vecToBlob, blobToVec } from './vecCodec';
import {
    tokenizeForBM25,
    computeIdf,
    scoreBM25,
    type BM25Doc,
} from './bm25';

// ─── Types (mirror design.md D2 + tasks.md Task 2.5) ──────────────────────────

export type NoteRecord = {
    path: string;
    mtime: number;
    title: string;
    description: string | null;
    tier: 'hot' | 'cold' | null;
    bodyVec: Float32Array;
    bodyDim: number;
    indexedAt: number;
};

export type ChunkRecord = {
    notePath: string;
    chunkIndex: number;
    content: string;
    vec: Float32Array;
};

export type BM25Hit = {
    notePath: string;
    chunkIndex: number;
    bm25Score: number;
};

export type ChunkRawRow = {
    notePath: string;
    chunkIndex: number;
    vec: Uint8Array;
};

// ─── Persistence hooks (injected by main.ts) ──────────────────────────────────

export type PersistAdapter = {
    read(path: string): Promise<Uint8Array | null>;
    write(path: string, bytes: Uint8Array): Promise<void>;
    exists(path: string): Promise<boolean>;
};

// ─── Store ────────────────────────────────────────────────────────────────────

const MUTATION_THRESHOLD = 100;
const IDLE_FLUSH_MS = 30_000;

export class SQLiteStore {
    private db!: Database;
    private mutationCount = 0;
    private idleTimer: ReturnType<typeof setTimeout> | null = null;
    private flushInFlight: Promise<void> | null = null;
    private disposed = false;

    private constructor(
        private readonly adapter: PersistAdapter,
        private readonly dbPath: string,
    ) {}

    /** True once dispose() has been called. Mutation methods become no-ops. */
    get isDisposed(): boolean {
        return this.disposed;
    }

    /** Factory: open existing db file or create fresh, apply schema. */
    static async open(adapter: PersistAdapter, dbPath: string): Promise<SQLiteStore> {
        const store = new SQLiteStore(adapter, dbPath);
        const exists = await adapter.exists(dbPath);
        const bytes = exists ? await adapter.read(dbPath) : null;
        store.db = await openDb(bytes);
        applySchema(store.db);
        return store;
    }

    // ─── Notes ────────────────────────────────────────────────────────────────

    upsertNote(note: NoteRecord): void {
        if (this.disposed) return;
        this.db.run(
            `INSERT OR REPLACE INTO notes
             (path, mtime, title, description, tier, body_vec, body_dim, indexed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                note.path,
                note.mtime,
                note.title,
                note.description,
                note.tier,
                vecToBlob(note.bodyVec),
                note.bodyDim,
                note.indexedAt,
            ],
        );
        this.touch();
    }

    getNote(path: string): NoteRecord | null {
        const res = this.db.exec(
            `SELECT path, mtime, title, description, tier, body_vec, body_dim, indexed_at
             FROM notes WHERE path = ?`,
            [path],
        );
        if (res.length === 0 || res[0].values.length === 0) return null;
        const row = res[0].values[0];
        return {
            path: row[0] as string,
            mtime: row[1] as number,
            title: row[2] as string,
            description: row[3] as string | null,
            tier: row[4] as 'hot' | 'cold' | null,
            bodyVec: blobToVec(row[5] as Uint8Array),
            bodyDim: row[6] as number,
            indexedAt: row[7] as number,
        };
    }

    deleteNote(path: string): void {
        if (this.disposed) return;
        // chunks cascade automatically via ON DELETE CASCADE.
        this.db.run('DELETE FROM notes WHERE path = ?', [path]);
        this.touch();
    }

    // ─── Chunks ───────────────────────────────────────────────────────────────

    upsertChunks(notePath: string, chunks: ChunkRecord[]): void {
        if (this.disposed) return;
        // Replace strategy: delete existing chunks for this note, insert new.
        this.db.run('DELETE FROM chunks WHERE note_path = ?', [notePath]);
        const insertChunk = this.db.prepare(
            `INSERT INTO chunks (note_path, chunk_index, content, vec)
             VALUES (?, ?, ?, ?)`,
        );
        try {
            for (const c of chunks) {
                insertChunk.run([c.notePath, c.chunkIndex, c.content, vecToBlob(c.vec)]);
            }
        } finally {
            insertChunk.free();
        }
        this.touch();
    }

    getChunks(notePath: string): ChunkRecord[] {
        const res = this.db.exec(
            `SELECT note_path, chunk_index, content, vec FROM chunks
             WHERE note_path = ? ORDER BY chunk_index ASC`,
            [notePath],
        );
        if (res.length === 0) return [];
        return res[0].values.map((row) => ({
            notePath: row[0] as string,
            chunkIndex: row[1] as number,
            content: row[2] as string,
            vec: blobToVec(row[3] as Uint8Array),
        }));
    }

    getAllChunksRaw(): ChunkRawRow[] {
        const res = this.db.exec(
            `SELECT note_path, chunk_index, vec FROM chunks`,
        );
        if (res.length === 0) return [];
        return res[0].values.map((row) => ({
            notePath: row[0] as string,
            chunkIndex: row[1] as number,
            vec: row[2] as Uint8Array,
        }));
    }

    getAllBodyVecs(): Map<string, Float32Array> {
        const out = new Map<string, Float32Array>();
        const res = this.db.exec('SELECT path, body_vec FROM notes WHERE body_vec IS NOT NULL');
        if (res.length === 0) return out;
        for (const row of res[0].values) {
            out.set(row[0] as string, blobToVec(row[1] as Uint8Array));
        }
        return out;
    }

    getAllTitles(): Map<string, string> {
        const out = new Map<string, string>();
        const res = this.db.exec('SELECT path, title FROM notes');
        if (res.length === 0) return out;
        for (const row of res[0].values) {
            out.set(row[0] as string, (row[1] as string) ?? '');
        }
        return out;
    }

    /**
     * Batch load all notes' light projection (path/title/tier/bodyVec) in one
     * SELECT. Used by Discover / Find Similar to avoid the per-note `getNote()`
     * SELECT inside hot cosine loops (the diff between this and N×`getNote()`
     * is roughly 100x on a 10k-vault Discover render).
     */
    getAllNotesLight(): Array<{ path: string; title: string; tier: 'hot' | 'cold' | null; bodyVec: Float32Array }> {
        const res = this.db.exec(
            'SELECT path, title, tier, body_vec FROM notes WHERE body_vec IS NOT NULL',
        );
        if (res.length === 0) return [];
        const out: Array<{ path: string; title: string; tier: 'hot' | 'cold' | null; bodyVec: Float32Array }> = [];
        for (const row of res[0].values) {
            const tierRaw = row[2] as string | null;
            const tier: 'hot' | 'cold' | null = tierRaw === 'cold' ? 'cold' : tierRaw === 'hot' ? 'hot' : null;
            out.push({
                path: row[0] as string,
                title: (row[1] as string) ?? '',
                tier,
                bodyVec: blobToVec(row[3] as Uint8Array),
            });
        }
        return out;
    }

    // ─── BM25 search (pure TypeScript, see bm25.ts for rationale) ─────────────

    /**
     * BM25 search over chunks.content.
     *
     * Implementation note: sql.js 1.14.1 doesn't ship FTS5, so we compute BM25
     * in TypeScript over the chunks table. For very large vaults (10k+ chunks)
     * this gets slow; a future change can swap the implementation behind this
     * API (signature contract preserved).
     *
     * @param query Raw query string. Tokenisation happens internally.
     */
    searchBM25(query: string, limit: number): BM25Hit[] {
        const queryTokens = tokenizeForBM25(query);
        if (queryTokens.length === 0) return [];

        // Load all (note_path, chunk_index, content) tuples and tokenise.
        const res = this.db.exec(
            `SELECT note_path, chunk_index, content FROM chunks`,
        );
        if (res.length === 0 || res[0].values.length === 0) return [];

        const docs: BM25Doc[] = res[0].values.map((row) => ({
            id: `${row[0] as string}#${row[1] as number}`,
            tokens: tokenizeForBM25(row[2] as string),
        }));

        const idf = computeIdf(queryTokens, docs);
        const ranked = scoreBM25(queryTokens, docs, idf, limit);

        return ranked.map((hit) => {
            const hashIdx = hit.id.lastIndexOf('#');
            return {
                notePath: hit.id.slice(0, hashIdx),
                chunkIndex: Number(hit.id.slice(hashIdx + 1)),
                bm25Score: hit.score,
            };
        });
    }

    // ─── Meta ─────────────────────────────────────────────────────────────────

    getMeta(key: string): string | null {
        const res = this.db.exec('SELECT value FROM meta WHERE key = ?', [key]);
        if (res.length === 0 || res[0].values.length === 0) return null;
        return res[0].values[0][0] as string;
    }

    setMeta(key: string, value: string): void {
        if (this.disposed) return;
        this.db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
        this.touch();
    }

    // ─── Bulk operations ──────────────────────────────────────────────────────

    /** Provider switch: clear all indexed data but preserve schema + meta.schema_version. */
    clearAllData(): void {
        if (this.disposed) return;
        this.db.exec(`
            DELETE FROM chunks;
            DELETE FROM notes;
        `);
        // Preserve schema_version; remove other meta that's now stale.
        this.db.run(`
            DELETE FROM meta WHERE key IN (
                'embedding_provider',
                'embedding_model_id',
                'embedding_dim',
                'last_indexed_at'
            )
        `);
        this.touch(/*force*/ true);
    }

    // ─── Persistence (debounced) ──────────────────────────────────────────────

    private touch(force = false): void {
        this.mutationCount++;
        if (this.idleTimer) clearTimeout(this.idleTimer);
        if (force || this.mutationCount >= MUTATION_THRESHOLD) {
            void this.flush();
        } else {
            this.idleTimer = setTimeout(() => void this.flush(), IDLE_FLUSH_MS);
        }
    }

    /** Force-flush to disk. Returns when bytes are persisted. */
    async flush(): Promise<void> {
        if (this.disposed) return;
        if (this.flushInFlight) return this.flushInFlight;
        this.flushInFlight = (async () => {
            try {
                if (this.idleTimer) {
                    clearTimeout(this.idleTimer);
                    this.idleTimer = null;
                }
                const bytes = exportDb(this.db);
                await this.adapter.write(this.dbPath, bytes);
                this.mutationCount = 0;
            } finally {
                this.flushInFlight = null;
            }
        })();
        return this.flushInFlight;
    }

    async dispose(): Promise<void> {
        if (this.disposed) return;
        this.disposed = true;
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        if (this.mutationCount > 0) await this.flush();
        this.db.close();
    }
}

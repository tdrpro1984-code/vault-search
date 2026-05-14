/**
 * sql.js (WASM SQLite) runtime initialization for Obsidian Electron environment.
 *
 * Bundling strategy (matches esbuild.config.mjs):
 *   - sql-wasm.wasm is NOT inlined — it ships as a sibling release asset
 *     and is fetched at runtime via `locateFile` pointing at the GitHub
 *     release URL. This keeps main.js below Obsidian Sync Standard's 5 MB
 *     limit and avoids tripping the bundle scanner on base64-encoded
 *     binary content (Obsidian's audit flags long base58-shaped strings
 *     even when they're WASM, not crypto addresses).
 *
 * sql.js exports a CommonJS factory; we use the typed import from @types/sql.js.
 */
import initSqlJs, { type SqlJsStatic, type Database } from 'sql.js';

const SQL_WASM_URL =
    'https://github.com/notoriouslab/vault-curate/releases/latest/download/sql-wasm.wasm';

let cachedStatic: SqlJsStatic | null = null;

/**
 * Lazily initialise the sql.js WASM module. First call triggers WASM compile;
 * subsequent calls return the cached static.
 */
export async function getSqlJs(): Promise<SqlJsStatic> {
    if (cachedStatic) return cachedStatic;
    cachedStatic = await initSqlJs({
        locateFile: (file: string) => file === 'sql-wasm.wasm' ? SQL_WASM_URL : file,
    });
    return cachedStatic;
}

/**
 * Open a database from existing bytes, or create a new empty one if bytes is null.
 */
export async function openDb(bytes: Uint8Array | null): Promise<Database> {
    const SQL = await getSqlJs();
    return bytes ? new SQL.Database(bytes) : new SQL.Database();
}

/**
 * Export a database to bytes for persistence. Caller writes the bytes to disk.
 */
export function exportDb(db: Database): Uint8Array {
    return db.export();
}

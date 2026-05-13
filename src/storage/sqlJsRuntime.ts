/**
 * sql.js (WASM SQLite) runtime initialization for Obsidian Electron environment.
 *
 * Bundling strategy (matches design.md D2 + esbuild.config.mjs):
 *   - sql-wasm.wasm is imported via esbuild's `'.wasm': 'binary'` loader,
 *     so the WASM binary is inlined into main.js as a Uint8Array literal.
 *   - This means initSqlJs() does not need to fetch the WASM from a URL —
 *     we pass the binary directly via `locateFile` returning a data URL,
 *     OR more reliably via the `wasmBinary` option.
 *
 * sql.js exports a CommonJS factory; we use the typed import from @types/sql.js.
 */
import initSqlJs, { type SqlJsStatic, type Database } from 'sql.js';
import sqlJsWasmBinary from 'sql.js/dist/sql-wasm.wasm';

let cachedStatic: SqlJsStatic | null = null;

/**
 * Lazily initialise the sql.js WASM module. First call triggers WASM compile;
 * subsequent calls return the cached static.
 */
export async function getSqlJs(): Promise<SqlJsStatic> {
    if (cachedStatic) return cachedStatic;
    cachedStatic = await initSqlJs({
        // sql.js typings don't expose wasmBinary directly, but the runtime accepts it.
        // We cast to bypass the typings gap.
        wasmBinary: sqlJsWasmBinary as unknown as ArrayBuffer,
    } as unknown as Parameters<typeof initSqlJs>[0]);
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

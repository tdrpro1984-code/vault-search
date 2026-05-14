/**
 * sql.js (WASM SQLite) runtime initialization for Obsidian's Electron renderer.
 *
 * `app://obsidian.md` has no CORS permission for github.com release downloads,
 * so the previous `locateFile`-pointing-at-GitHub approach failed at runtime
 * (`No 'Access-Control-Allow-Origin' header is present`). Instead we let
 * main.ts fetch the WASM bytes via Obsidian's `requestUrl` (which bypasses
 * browser CORS), then pass the bytes to `initSqlJs` via the `wasmBinary`
 * Emscripten option.
 *
 * sql.js exports a CommonJS factory; the typed import is from @types/sql.js,
 * whose `SqlJsConfig = Partial<EmscriptenModule>` already includes
 * `wasmBinary` from @types/emscripten.
 */
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";

let cachedStatic: SqlJsStatic | null = null;

/**
 * Lazily initialise the sql.js WASM module. First call instantiates from the
 * provided bytes; subsequent calls return the cached static and ignore the
 * argument (the WASM module is global to the process).
 */
export async function getSqlJs(wasmBinary: Uint8Array): Promise<SqlJsStatic> {
    if (cachedStatic) return cachedStatic;
    const ab = new ArrayBuffer(wasmBinary.byteLength);
    new Uint8Array(ab).set(wasmBinary);
    cachedStatic = await initSqlJs({ wasmBinary: ab });
    return cachedStatic;
}

/**
 * Open a database from existing bytes, or create a new empty one if bytes is null.
 */
export async function openDb(
    bytes: Uint8Array | null,
    wasmBinary: Uint8Array,
): Promise<Database> {
    const SQL = await getSqlJs(wasmBinary);
    return bytes ? new SQL.Database(bytes) : new SQL.Database();
}

/**
 * Export a database to bytes for persistence. Caller writes the bytes to disk.
 */
export function exportDb(db: Database): Uint8Array {
    return db.export();
}

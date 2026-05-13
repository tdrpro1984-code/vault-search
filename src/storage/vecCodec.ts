/**
 * Float32Array ⇄ Uint8Array (BLOB) codec for SQLite storage.
 *
 * SQLite BLOB column stores raw bytes. We want to store embedding vectors
 * (Float32Array) and decode them efficiently when reading back.
 *
 * Notes:
 *   - `vecToBlob` returns a Uint8Array view sharing the underlying buffer.
 *     sql.js's bind/run will copy the bytes when writing to the DB, so the
 *     buffer share is safe at write time. If callers need a snapshot for
 *     long-lived storage, they should copy via `new Uint8Array(blob)`.
 *   - `blobToVec` MUST handle Uint8Array views with non-zero byteOffset
 *     (sql.js commonly returns BLOB columns as views into a larger buffer).
 *     It copies bytes into a fresh Float32Array to avoid alignment issues
 *     (Float32Array requires 4-byte alignment which view offsets may break).
 */

export function vecToBlob(v: Float32Array): Uint8Array {
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

export function blobToVec(b: Uint8Array): Float32Array {
    if (b.byteLength === 0) return new Float32Array(0);
    // Copy bytes into a fresh, aligned ArrayBuffer to satisfy Float32Array alignment.
    const aligned = new ArrayBuffer(b.byteLength);
    new Uint8Array(aligned).set(b);
    return new Float32Array(aligned);
}

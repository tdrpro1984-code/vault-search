/**
 * chunker — fixed-size text splitter for vault-curate.
 *
 * Design rationale: see openspec/changes/004-vault-curate-rebrand/design.md D7.
 *
 * Replaces v0.3.x three-mode chunking (off/smart/all) with a single
 * fixed-size policy. Each chunk is prefixed with the note title so that
 * downstream BM25 + embedding both pick up title context.
 *
 * `chunkIndex` is 0-based and matches the `chunks.chunk_index` column
 * defined in D2 schema.
 */

export interface ChunkerSettings {
    chunkSize: number;
    chunkOverlap: number;
}

export interface Chunk {
    /** Title-prefixed chunk text written into `chunks.content`. */
    content: string;
    /** 0-based, monotonic within the note (matches D2 schema). */
    chunkIndex: number;
}

/**
 * Split `body` into fixed-size, overlapping windows; prepend `title` to each.
 *
 * Contract:
 *   - At least one chunk is returned for non-empty input.
 *   - Empty / whitespace-only body → single chunk containing just the title.
 *   - Overlap >= size is treated as 0 (defensive against bad settings).
 */
export function splitChunks(
    body: string,
    title: string,
    settings: ChunkerSettings,
): Chunk[] {
    const trimmed = body.trim();
    const prefix = title ? `${title}\n` : '';

    if (trimmed.length === 0) {
        return [{ content: `${prefix}`.trimEnd(), chunkIndex: 0 }];
    }

    const size = Math.max(1, settings.chunkSize);
    const overlap = settings.chunkOverlap >= size ? 0 : Math.max(0, settings.chunkOverlap);
    const step = size - overlap;

    if (trimmed.length <= size) {
        return [{ content: `${prefix}${trimmed}`, chunkIndex: 0 }];
    }

    const out: Chunk[] = [];
    let chunkIndex = 0;
    for (let i = 0; i < trimmed.length; i += step) {
        const slice = trimmed.slice(i, i + size);
        out.push({ content: `${prefix}${slice}`, chunkIndex });
        chunkIndex++;
        if (i + size >= trimmed.length) break;
    }
    return out;
}

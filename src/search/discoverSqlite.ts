// Discover (SQLite-backed) — Phase 8 of 004 rebrand.
//
// Replaces the legacy in-memory plugin.index path with SQLite body_vec
// reads. `cosineNormalized` exploits the fact that embeddings are stored
// L2-normalized (workers/embeddingWorker.ts `normalize: true`), so dot
// product == cosine similarity directly.

import type { SQLiteStore } from "../storage/SQLiteStore";
import type { SearchResult } from "../types";

function cosineNormalized(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}

export interface DiscoverSettings {
    minScore: number;
    topResults: number;
}

/**
 * Notes most similar to `currentPath`, with cold notes promoted (the
 * Discover differentiator). Caller is expected to be on the active-file
 * path; mismatched / missing notes return [].
 */
export function discoverForNoteSqlite(
    currentPath: string,
    store: SQLiteStore,
    settings: DiscoverSettings,
): SearchResult[] {
    const self = store.getNote(currentPath);
    if (!self || self.bodyVec.length === 0) return [];

    const all = store.getAllBodyVecs();
    const results: SearchResult[] = [];
    for (const [path, vec] of all) {
        if (path === currentPath) continue;
        const score = cosineNormalized(self.bodyVec, vec);
        if (score < settings.minScore) continue;
        const note = store.getNote(path);
        if (!note) continue;
        results.push({
            path,
            title: note.title,
            tags: [],
            score,
            tier: note.tier ?? "hot",
        });
    }

    // First cut by score to keep relevant candidates only.
    results.sort((a, b) => b.score - a.score);
    const candidates = results.slice(0, settings.topResults * 2);

    // Re-sort: cold first, then by score within each tier — Discover's
    // "highlight what you haven't explored yet" UX.
    candidates.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier === "cold" ? -1 : 1;
        return b.score - a.score;
    });
    return candidates.slice(0, settings.topResults);
}

/**
 * Cold notes globally ranked by max-pool similarity to the Hot pool.
 * Yields to the main thread every 50 cold notes to keep the UI responsive
 * during the O(|cold| × |hot|) sweep.
 */
export async function globalDiscoverSqlite(
    store: SQLiteStore,
    settings: DiscoverSettings,
    onProgress?: (done: number, total: number) => void,
    cancelled?: { value: boolean },
): Promise<SearchResult[]> {
    const all = store.getAllBodyVecs();
    const hot: Float32Array[] = [];
    const cold: { path: string; vec: Float32Array }[] = [];
    for (const [path, vec] of all) {
        if (vec.length === 0) continue;
        const note = store.getNote(path);
        if (!note) continue;
        if (note.tier === "cold") cold.push({ path, vec });
        else hot.push(vec);
    }
    if (hot.length === 0 || cold.length === 0) return [];

    const results: SearchResult[] = [];
    for (let i = 0; i < cold.length; i++) {
        if (cancelled?.value) return results;
        const { path, vec } = cold[i];
        let max = 0;
        for (const h of hot) {
            const s = cosineNormalized(vec, h);
            if (s > max) max = s;
        }
        if (max >= settings.minScore) {
            const note = store.getNote(path);
            if (note) {
                results.push({
                    path,
                    title: note.title,
                    tags: [],
                    score: max,
                    tier: "cold",
                });
            }
        }
        if ((i + 1) % 50 === 0) {
            onProgress?.(i + 1, cold.length);
            await new Promise(r => setTimeout(r, 0));
        }
    }
    onProgress?.(cold.length, cold.length);

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, settings.topResults);
}

/** Find Similar — note-level cosine, no cold/hot promotion. */
export function findSimilarSqlite(
    currentPath: string,
    store: SQLiteStore,
    settings: DiscoverSettings,
): SearchResult[] {
    const self = store.getNote(currentPath);
    if (!self || self.bodyVec.length === 0) return [];

    const all = store.getAllBodyVecs();
    const results: SearchResult[] = [];
    for (const [path, vec] of all) {
        if (path === currentPath) continue;
        const score = cosineNormalized(self.bodyVec, vec);
        if (score < settings.minScore) continue;
        const note = store.getNote(path);
        if (!note) continue;
        results.push({
            path,
            title: note.title,
            tags: [],
            score,
            tier: note.tier ?? "hot",
        });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, settings.topResults);
}

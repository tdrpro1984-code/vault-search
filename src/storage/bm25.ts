/**
 * Pure-TypeScript BM25 ranking for vault-curate.
 *
 * Why not FTS5: sql.js (v1.14.1, the version we bundle) ships without FTS5
 * extension compiled in (only FTS3 + FTS4 are enabled). Rather than swap to a
 * different SQLite WASM distribution (e.g. @sqlite.org/sqlite-wasm) — which
 * would mean changing the entire storage API surface — we keep sql.js for
 * its battle-tested simplicity and compute BM25 in TypeScript instead.
 *
 * Reference (same approach as `erayaydn0/obsidian-vault-search` 0.1.0):
 *   `src/core/SQLiteStore/scoring.ts` ships BM25 in plain TS.
 *
 * Tokenisation uses the same `cjkTokenize` rules as design.md D2 specified for
 * FTS5 (CJK trigrams + ASCII words), so query/doc tokens line up consistently.
 */
import { tokenizeCJK } from './cjkTokenize';

export type BM25Doc = {
    id: string;       // opaque caller-supplied identifier (e.g. `${notePath}#${chunkIndex}`)
    tokens: string[]; // pre-tokenised content (output of tokenizeForBM25)
};

export type BM25Hit = {
    id: string;
    score: number;
};

/**
 * Tokenise text into BM25-ready tokens. Wraps `tokenizeCJK` to produce an array
 * rather than a space-joined string.
 */
export function tokenizeForBM25(text: string): string[] {
    if (!text) return [];
    const s = tokenizeCJK(text);
    if (!s) return [];
    return s.split(' ').filter((t) => t.length > 0);
}

/**
 * Compute IDF for each unique query term over the document collection.
 * Uses BM25+ variant: IDF(t) = ln((N - df + 0.5) / (df + 0.5) + 1) → always ≥ 0.
 */
export function computeIdf(queryTokens: string[], docs: BM25Doc[]): Map<string, number> {
    const idf = new Map<string, number>();
    if (queryTokens.length === 0 || docs.length === 0) return idf;

    const uniqueTerms = new Set(queryTokens);
    const df = new Map<string, number>();
    for (const term of uniqueTerms) df.set(term, 0);

    for (const doc of docs) {
        const seen = new Set(doc.tokens);
        for (const term of uniqueTerms) {
            if (seen.has(term)) df.set(term, df.get(term)! + 1);
        }
    }

    const N = docs.length;
    for (const term of uniqueTerms) {
        const dfVal = df.get(term) ?? 0;
        idf.set(term, Math.log((N - dfVal + 0.5) / (dfVal + 0.5) + 1));
    }
    return idf;
}

/**
 * Score every document against the query and return the top-`limit` matches.
 * Docs with zero matching terms are excluded.
 *
 * BM25 formula: Σ IDF(qi) * (tf * (k1+1)) / (tf + k1 * (1 - b + b * |D|/avgdl))
 * Defaults k1=1.5, b=0.75 (standard).
 */
export function scoreBM25(
    queryTokens: string[],
    docs: BM25Doc[],
    idf: Map<string, number>,
    limit: number,
    k1 = 1.5,
    b = 0.75,
): BM25Hit[] {
    if (queryTokens.length === 0 || docs.length === 0) return [];

    let totalLen = 0;
    for (const d of docs) totalLen += d.tokens.length;
    const avgdl = totalLen / docs.length;
    if (avgdl === 0) return [];

    const hits: BM25Hit[] = [];
    for (const doc of docs) {
        const tf = new Map<string, number>();
        for (const tok of doc.tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);

        const dl = doc.tokens.length;
        const norm = 1 - b + b * (dl / avgdl);

        let score = 0;
        let matched = false;
        for (const qt of queryTokens) {
            const w = idf.get(qt) ?? 0;
            if (w <= 0) continue;
            const f = tf.get(qt) ?? 0;
            if (f === 0) continue;
            matched = true;
            score += w * ((f * (k1 + 1)) / (f + k1 * norm));
        }
        if (matched) hits.push({ id: doc.id, score });
    }

    hits.sort((a, b2) => b2.score - a.score);
    return hits.slice(0, limit);
}

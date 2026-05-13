/**
 * Reciprocal Rank Fusion (RRF) for hybrid search.
 *
 * Design rationale: see openspec/changes/004-vault-curate-rebrand/design.md D6.
 *
 * Each retriever supplies a Map<docId, score>. We rank within each retriever
 * (higher input score = lower rank index) and accumulate
 *     fused[doc] = Σ weight[i] / (k + rank + 1)
 * Standard k = 60 (TREC literature). Higher weight on a retriever amplifies
 * its rank contribution without re-normalising heterogeneous score scales —
 * that's the whole reason RRF wins over linear combination on BM25 + cosine.
 */

/** Fuse N ranked retriever outputs. Returns docId → fused score (descending). */
export function rrfFuse(
    results: Map<string, number>[],
    weights: number[],
    k: number = 60,
): Map<string, number> {
    if (results.length !== weights.length) {
        throw new Error(
            `rrfFuse: results.length (${results.length}) !== weights.length (${weights.length})`,
        );
    }
    const fused = new Map<string, number>();
    for (let i = 0; i < results.length; i++) {
        const w = weights[i];
        if (w === 0) continue; // disabled retriever contributes nothing
        const ranked = Array.from(results[i].entries()).sort((a, b) => b[1] - a[1]);
        for (let rank = 0; rank < ranked.length; rank++) {
            const docId = ranked[rank][0];
            fused.set(docId, (fused.get(docId) ?? 0) + w / (k + rank + 1));
        }
    }
    return fused;
}

/** Sort a fused-score map into descending list and take the top N. */
export function topNFused(
    fused: Map<string, number>,
    n: number,
): Array<{ docId: string; score: number }> {
    return Array.from(fused.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([docId, score]) => ({ docId, score }));
}

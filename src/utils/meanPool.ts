/**
 * meanPool — element-wise average over a set of vectors.
 *
 * Used by the indexer to compute `notes.body_vec` from chunk vectors
 * (design.md D2 + D3: body_vec excludes title/description, contains
 * only chunk-vec mean-pool).
 */
export function meanPool(vecs: Float32Array[]): Float32Array {
    if (vecs.length === 0) {
        throw new Error('meanPool: empty input — caller must supply at least one vector');
    }
    const dim = vecs[0].length;
    if (dim === 0) {
        throw new Error('meanPool: zero-dimensional vector');
    }
    const out = new Float32Array(dim);
    for (const v of vecs) {
        if (v.length !== dim) {
            throw new Error(`meanPool: dimension mismatch (${v.length} vs ${dim})`);
        }
        for (let i = 0; i < dim; i++) {
            out[i] += v[i];
        }
    }
    const n = vecs.length;
    for (let i = 0; i < dim; i++) {
        out[i] /= n;
    }
    return out;
}
